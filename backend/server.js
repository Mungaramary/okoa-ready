// backend/server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const XLSX = require("xlsx");

// Tasks router (expects native Mongo DB handle)
const tasksRouter = require("./routes/tasks");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// --- Static dirs ---
const FRONTEND_DIR = path.join(__dirname, "..", "frontend", "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Per-type upload subdirs
function ensureSubdir(type) {
  const dir = path.join(UPLOAD_DIR, type);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, ensureSubdir(req.uploadType || "misc")),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({ storage });

// Middleware & static
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(FRONTEND_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

// ----- Mongo connect -----
if (!MONGODB_URI) {
  console.error("❌ No MONGODB_URI (or MONGO_URI) in environment");
  process.exit(1);
}
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Mongoose models
const Payment = require("./models/Payment");
const FileModel = require("./models/File");
const User = require("./models/users");

// Serve uploads idempotently
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------- HEALTH ----------
app.get("/api/health", async (_req, res) => {
  try {
    const state = mongoose.connection.readyState; // 1 = connected
    const [payments, files] = await Promise.all([
      Payment.countDocuments().catch(() => -1),
      FileModel.countDocuments().catch(() => -1),
    ]);
    res.json({
      ok: state === 1,
      mongooseState: state,
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

// ---------- USERS (collectors list) ----------
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

    const list = existing?.length
      ? existing.map((u) => ({ id: String(u._id), name: u.name }))
      : fallback;

    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Excel serial -> JS Date ----------
function excelSerialToDate(n) {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const utcDays = Math.floor(n - 25569);
  const frac = n - Math.floor(n);
  const utcSeconds = utcDays * 86400 + Math.round(frac * 86400);
  const d = new Date(utcSeconds * 1000);
  return isNaN(d) ? null : d;
}

// ---------- PAYMENTS ----------
app.get("/api/payments", async (req, res) => {
  try {
    const { collectorId } = req.query;
    const q = {};
    if (collectorId) q.collectorId = collectorId;
    const rows = await Payment.find(q).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post(
  "/api/payments/upload",
  (req, _res, next) => {
    req.uploadType = "payments";
    next();
  },
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const collectorId = req.query.collectorId || req.body.collectorId || null;

      const saved = await FileModel.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/payments/${req.file.filename}`,
        size: req.file.size,
        type: "payments",
        collectorId,
      });

      const fullPath = path.join(UPLOAD_DIR, "payments", req.file.filename);
      const wb = XLSX.readFile(fullPath);
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      let header = data[0] || [];
      const idx = {
        agent: header.findIndex((h) => String(h).toLowerCase().includes("agent")),
        loan: header.findIndex((h) => String(h).toLowerCase().includes("loan")),
        paid: header.findIndex((h) => String(h).toLowerCase().includes("paid")),
        bal: header.findIndex((h) => String(h).toLowerCase().includes("balance")),
        date: header.findIndex((h) => String(h).toLowerCase().includes("date")),
      };

      const docs = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        const agentNo = idx.agent >= 0 ? row[idx.agent] : row[0];
        const loanAmount = Number(idx.loan >= 0 ? row[idx.loan] : 0) || 0;
        const amountPaid = Number(idx.paid >= 0 ? row[idx.paid] : 0) || 0;
        const loanBalance = Number(idx.bal >= 0 ? row[idx.bal] : 0) || 0;
        let dateVal = idx.date >= 0 ? row[idx.date] : null;
        let d = null;
        if (typeof dateVal === "number") d = excelSerialToDate(dateVal);
        else if (dateVal instanceof Date) d = dateVal;
        else if (typeof dateVal === "string") {
          const tryD = new Date(dateVal);
          d = isNaN(tryD) ? null : tryD;
        }
        docs.push({
          collectorId,
          agentNo,
          loanAmount,
          amountPaid,
          loanBalance,
          date: d || new Date(),
          createdAt: new Date(),
        });
      }
      if (docs.length) await Payment.insertMany(docs);

      res.json({ ok: true, file: saved, inserted: docs.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

// ---------- ACCOUNTS ----------
app.post(
  "/api/accounts/upload",
  (req, _res, next) => {
    req.uploadType = "accounts";
    next();
  },
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const saved = await FileModel.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/accounts/${req.file.filename}`,
        size: req.file.size,
        type: "accounts",
        collectorId: null,
      });
      res.json({ ok: true, file: saved });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

app.get("/api/accounts/files", async (_req, res) => {
  try {
    const files = await FileModel.find({ type: "accounts" }).sort({ createdAt: -1 }).limit(200).lean();
    const out =
      (files || []).map((f) => ({
        name: f.originalName || f.filename,
        filename: f.filename,
        size: f.size,
        createdAt: f.createdAt,
        uploadedAt: f.createdAt,
        url: f.path || `/uploads/accounts/${f.filename}`,
      })) || [];
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- REPORTS ----------
app.post(
  "/api/reports/upload",
  (req, _res, next) => {
    req.uploadType = "reports";
    next();
  },
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const saved = await FileModel.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/reports/${req.file.filename}`,
        size: req.file.size,
        type: "reports",
        collectorId: null,
      });
      res.json({ ok: true, file: saved });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

app.get("/api/reports/files", async (_req, res) => {
  try {
    const files = await FileModel.find({ type: "reports" }).sort({ createdAt: -1 }).limit(200).lean();
    const out =
      (files || []).map((f) => ({
        name: f.originalName || f.filename,
        filename: f.filename,
        size: f.size,
        createdAt: f.createdAt,
        uploadedAt: f.createdAt,
        url: f.path || `/uploads/reports/${f.filename}`,
      })) || [];
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- HTML routing ----------
function sendHtml(res, file) {
  const full = path.join(FRONTEND_DIR, file);
  if (fs.existsSync(full)) return res.sendFile(full);
  res.status(404).send("Page not found");
}
app.get("/", (_req, res) => sendHtml(res, "dashboard.html"));
app.get("/:page", (req, res, next) => {
  const file = req.params.page.endsWith(".html") ? req.params.page : `${req.params.page}.html`;
  const candidate = path.join(FRONTEND_DIR, file);
  fs.access(candidate, fs.constants.F_OK, (err) => {
    if (err) return next();
    return res.sendFile(candidate);
  });
});
app.get(["/index", "/index.html"], (_req, res) => {
  const idx = path.join(FRONTEND_DIR, "index.html");
  if (fs.existsSync(idx)) return res.sendFile(idx);
  return res.redirect("/dashboard.html");
});
app.use((_req, res) => res.status(404).send("Page not found"));

/* ---------- SAFE MOUNT of Tasks & START ---------- */

let tasksMounted = false;
function tryMountTasks() {
  if (tasksMounted) return;
  const state = mongoose.connection.readyState;
  const nativeDb = mongoose.connection.db;
  if (state === 1 && nativeDb) {
    app.use("/api", tasksRouter(nativeDb));
    tasksMounted = true;
    console.log("🧩 Tasks API mounted at /api/tasks (state:", state, ")");
  }
}

// Mount immediately if already connected (fast boots), and also on events
tryMountTasks();
mongoose.connection.once("open", tryMountTasks);
mongoose.connection.on("connected", tryMountTasks);

// Start server immediately; Tasks mounts as soon as DB is ready
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server at http://${HOST}:${PORT}`);
  console.log(`📁 Serving frontend from: ${FRONTEND_DIR}`);
  console.log(`📂 Serving uploads from: ${UPLOAD_DIR} -> /uploads`);
});



