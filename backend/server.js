// backend/server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const XLSX = require("xlsx");

// Models
const Payment = require("./models/Payment");
const FileModel = require("./models/File");
const User = require("./models/users");
const Task = require("./models/Task");

const app = express();

/* =========================
   ENV + PATHS
   ========================= */
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const FRONTEND_DIR = path.join(__dirname, "..", "frontend", "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function ensureSubdir(type) {
  const dir = path.join(UPLOAD_DIR, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* =========================
   MULTER STORAGE
   ========================= */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, ensureSubdir(req.uploadType || "misc")),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({ storage });

/* =========================
   APP MIDDLEWARE
   ========================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));          // serve uploaded files
app.use(express.static(FRONTEND_DIR));                    // serve frontend assets

/* =========================
   HELPERS
   ========================= */
function excelSerialToDate(n) {
  const num = Number(n);
  if (!isFinite(num)) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + num * 86400000);
  return isNaN(d) ? null : d;
}
function normCollectorId(v) {
  if (!v) return "";
  v = String(v).trim().toLowerCase();
  if (/^collector\s*-?\s*1$/.test(v)) return "collector-1";
  if (/^collector\s*-?\s*2$/.test(v)) return "collector-2";
  if (/^collector\s*-?\s*3$/.test(v)) return "collector-3";
  if (/^collector-\d+$/.test(v)) return v;
  return v;
}
function norm(v) {
  return String(v || "").trim().toLowerCase();
}

/* =========================
   DB CONNECT
   ========================= */
if (!MONGODB_URI) {
  console.error("❌ No MONGODB_URI (or MONGO_URI) in .env");
  process.exit(1);
}
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

/* =========================================================
   ALL /api ROUTES (keep these ABOVE the static page routes)
   ========================================================= */

// ---- HEALTH & USERS ----
app.get("/api/health", async (_req, res) => {
  try {
    const [payments, files] = await Promise.all([
      Payment.countDocuments().catch(() => -1),
      FileModel.countDocuments().catch(() => -1),
    ]);
    res.json({
      ok: mongoose.connection.readyState === 1,
      mongooseState: mongoose.connection.readyState,
      db: mongoose.connection.name,
      host: mongoose.connection.host,
      counts: { payments, files },
      time: new Date().toISOString(),
      frontendDir: FRONTEND_DIR,
      uploadsDir: UPLOAD_DIR,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/users/collectors", async (_req, res) => {
  try {
    const existing = await User.find({ role: "collector" })
      .sort({ name: 1 })
      .select({ _id: 1, name: 1 })
      .lean();

    const fallback = [
      { id: "collector-1", name: "Collector 1" },
      { id: "collector-2", name: "Collector 2" },
      { id: "collector-3", name: "Collector 3" },
    ];
    const list =
      existing?.length > 0
        ? existing.map((u) => ({ id: String(u._id), name: u.name }))
        : fallback;
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- PAYMENTS ----
app.get("/api/payments", async (req, res) => {
  try {
    const q = {};
    if (req.query.collectorId) q.collectorId = String(req.query.collectorId).trim().toLowerCase();
    const rows = await Payment.find(q).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post(
  "/api/payments/upload",
  (req, _res, next) => { req.uploadType = "payments"; next(); },
  upload.single("file"),
  async (req, res) => {
    try {
      const collectorId = normCollectorId(req.body.collectorId || req.query.collectorId || "");
      if (!collectorId) return res.status(400).json({ error: "Select a target collector." });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      await FileModel.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/payments/${req.file.filename}`,
        size: req.file.size,
        type: "payments",
        collectorId,
      });

      const fullPath = path.join(UPLOAD_DIR, "payments", req.file.filename);
      const wb = XLSX.readFile(fullPath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const header = data[0] || [];
      const nameToIdx = {};
      header.forEach((h, i) => (nameToIdx[String(h || "").trim().toLowerCase()] = i));
      const idx = {
        agent: nameToIdx["agent"] ?? 0,
        loan: nameToIdx["loan amount"] ?? 1,
        paid: nameToIdx["paid"] ?? 2,
        bal: nameToIdx["balance"] ?? 3,
        date: nameToIdx["date"] ?? 4,
      };

      const docs = [];
      for (let r = 1; r < data.length; r++) {
        const row = data[r] || [];
        if (!row.length) continue;
        if (row.some((c) => String(c || "").trim().toLowerCase() === "totals")) continue;

        const agentNo = row[idx.agent];
        const loanAmount = Number(row[idx.loan] || 0);
        const amountPaid = Number(row[idx.paid] || 0);
        const loanBalance = Number(row[idx.bal] || 0);

        let date = null;
        const rawDate = row[idx.date];
        if (typeof rawDate === "number") date = excelSerialToDate(rawDate);
        else if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d)) date = d;
        }

        if (!agentNo && !loanAmount && !amountPaid && !loanBalance) continue;

        docs.push({
          collectorId,
          agentNo,
          loanAmount,
          amountPaid,
          loanBalance,
          date,
          createdAt: new Date(),
        });
      }

      if (docs.length) await Payment.insertMany(docs);
      res.json({ ok: true, inserted: docs.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ---- ACCOUNTS (file records only) ----
app.post(
  "/api/accounts/upload",
  (req, _res, next) => { req.uploadType = "accounts"; next(); },
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const collectorId = normCollectorId(req.body.collectorId || req.query.collectorId || "");
      await FileModel.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/accounts/${req.file.filename}`,
        size: req.file.size,
        type: "accounts",
        collectorId: collectorId || null,
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

app.get("/api/accounts/files", async (req, res) => {
  try {
    const q = { type: "accounts" };
    if (req.query.collectorId) q.collectorId = String(req.query.collectorId).trim().toLowerCase();
    const files = await FileModel.find(q).sort({ createdAt: -1 }).limit(500).lean();
    res.json(
      (files || []).map((f) => ({
        _id: String(f._id),
        name: f.originalName || f.filename,
        filename: f.filename,
        size: f.size,
        uploadedAt: f.createdAt,
        collectorId: f.collectorId || null,
        url: f.path || `/uploads/accounts/${f.filename}`,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/accounts/file/:id", async (req, res) => {
  try {
    const _id = req.params.id;
    const doc = await FileModel.findOne({ _id, type: "accounts" });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await FileModel.deleteOne({ _id });

    const diskPath = path.join(UPLOAD_DIR, "accounts", path.basename(doc.filename || ""));
    try { if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath); } catch (_) {}
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- REPORTS ----
app.post(
  "/api/reports/upload",
  (req, _res, next) => { req.uploadType = "reports"; next(); },
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const me = String(req.query.me || req.body.me || "").trim().toLowerCase();
      let collectorId = null;

      if (me === "tl") {
        collectorId = String(req.query.collectorId || req.body.collectorId || "")
          .trim().toLowerCase() || null;
      } else if (me.startsWith("collector-")) {
        collectorId = me;
      }

      const saved = await FileModel.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/reports/${req.file.filename}`,
        size: req.file.size,
        type: "reports",
        collectorId,
      });

      res.json({ ok: true, file: saved });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

app.get("/api/reports/files", async (req, res) => {
  try {
    const { collectorId } = req.query;
    const q = { type: "reports" };
    if (collectorId && collectorId !== "all") q.collectorId = String(collectorId);
    const files = await FileModel.find(q).sort({ createdAt: -1 }).limit(500).lean();
    const out = (files || []).map((f) => ({
      _id: String(f._id),
      name: f.originalName || f.filename,
      filename: f.filename,
      size: f.size,
      createdAt: f.createdAt,
      collectorId: f.collectorId || null,
      url: f.path || `/uploads/reports/${f.filename}`,
    }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/reports/file/:id", async (req, res) => {
  try {
    const _id = req.params.id;
    const doc = await FileModel.findOne({ _id, type: "reports" });
    if (!doc) return res.status(404).json({ error: "Not found" });
    await FileModel.deleteOne({ _id });

    const diskPath = path.join(UPLOAD_DIR, "reports", path.basename(doc.filename || ""));
    try { if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath); } catch (_) {}

    res.json({ ok: true, deleted: _id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- TASKS (INLINE CRUD) ----
app.get("/api/tasks", async (req, res) => {
  try {
    const me = norm(req.query.me);
    if (!me) return res.status(400).json({ error: "Missing me" });

    let q = {};
    if (me !== "tl") {
      q = { $or: [{ assignedTo: me }, { createdBy: me }] };
    }
    const rows = await Task.find(q).sort({ createdAt: -1 }).limit(500).lean();
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const createdBy = norm(req.body.createdBy);
    const assignedTo = norm(req.body.assignedTo || createdBy);
    if (!title || !createdBy) {
      return res.status(400).json({ error: "title and createdBy required" });
    }
    let dueDate = null;
    if (req.body.dueDate) {
      const d = new Date(req.body.dueDate);
      if (!isNaN(d)) dueDate = d;
    }
    const saved = await Task.create({
      title,
      details: String(req.body.details || ""),
      dueDate,
      assignedTo,
      createdBy,
      status: "open",
    });
    res.json({ ok: true, task: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/tasks/:id", async (req, res) => {
  try {
    const _id = req.params.id;
    const patch = {};
    if (req.body.status) patch.status = String(req.body.status);
    if (req.body.title) patch.title = String(req.body.title);
    if (req.body.details) patch.details = String(req.body.details);
    if (req.body.assignedTo) patch.assignedTo = norm(req.body.assignedTo);
    if (req.body.dueDate) {
      const d = new Date(req.body.dueDate);
      if (!isNaN(d)) patch.dueDate = d;
    }
    const updated = await Task.findByIdAndUpdate(_id, patch, { new: true });
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, task: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const _id = req.params.id;
    const found = await Task.findById(_id);
    if (!found) return res.status(404).json({ error: "Not found" });
    await Task.deleteOne({ _id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =======================================
   STATIC PAGES (place at the VERY END)
   ======================================= */
function sendHtml(res, file) {
  const full = path.join(FRONTEND_DIR, file);
  if (fs.existsSync(full)) return res.sendFile(full);
  res.status(404).send("Page not found");
}

app.get("/", (_req, res) => sendHtml(res, "dashboard.html"));

// Serve any non-API path as an HTML page (ignore /api/*)
app.get(/^\/(?!api\/).+$/, (req, res, next) => {
  const page = req.path.replace(/^\//, "");
  const file = page.endsWith(".html") ? page : `${page}.html`;
  const cand = path.join(FRONTEND_DIR, file);
  fs.access(cand, fs.constants.F_OK, (err) => (err ? next() : res.sendFile(cand)));
});

app.use((_req, res) => res.status(404).send("Page not found"));

/* =========================
   LISTEN
   ========================= */
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
