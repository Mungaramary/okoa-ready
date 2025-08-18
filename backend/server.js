// backend/server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const XLSX = require("xlsx");

const tasksRouter = require("./routes/tasks");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const FRONTEND_DIR = path.join(__dirname, "..", "frontend", "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function ensureSubdir(type) {
  const dir = path.join(UPLOAD_DIR, type);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, ensureSubdir(req.uploadType || "misc")),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}_${safe}`);
  },
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(FRONTEND_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

// Tasks API
app.use("/api", tasksRouter());

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

const Payment = require("./models/Payment");
const FileModel = require("./models/File");
const User = require("./models/users");

// ---------- HEALTH ----------
app.get("/api/health", async (_req, res) => {
  try {
    const state = mongoose.connection.readyState;
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
function coerceDate(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") return excelSerialToDate(val);
  if (val instanceof Date) return isNaN(val) ? null : val;
  const tryD = new Date(String(val).replace(/-/g, "/")); // be lenient
  return isNaN(tryD) ? null : tryD;
}

// ---------- PAYMENTS ----------
app.get("/api/payments", async (req, res) => {
  try {
    const { collectorId, limit } = req.query;
    const q = {};
    if (collectorId) q.collectorId = collectorId;
    const rows = await Payment.find(q)
      .sort({ date: -1, createdAt: -1 })
      .limit(Number(limit || 2000))
      .lean();
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Accepts sheets with headers like: Collector | Agent | Loan Amount | Paid | Balance | Date
// Flexible header matching; fixes dates (serials & strings)
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

      // Find header row (first non-empty row with >= 4 columns)
      let headerRowIdx = 0;
      while (headerRowIdx < data.length && (!data[headerRowIdx] || data[headerRowIdx].filter(Boolean).length < 4)) {
        headerRowIdx++;
      }
      const header = (data[headerRowIdx] || []).map(h => String(h || "").trim().toLowerCase());

      function findIdx(...keys) {
        return header.findIndex(h => keys.some(k => h.includes(k)));
      }

      const idx = {
        collector: findIdx("collector"),
        agent: findIdx("agent"),
        loan: findIdx("loan amount", "loan"),
        paid: findIdx("paid", "amount paid"),
        bal: findIdx("balance", "outstanding"),
        date: findIdx("date"),
      };

      // If date still not found, assume last column is date
      if (idx.date < 0 && header.length) idx.date = header.length - 1;

      const docs = [];
      for (let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i] || [];
        const agentNo = idx.agent >= 0 ? row[idx.agent] : row[0];
        const loanAmount = Number(idx.loan >= 0 ? row[idx.loan] : 0) || 0;
        const amountPaid = Number(idx.paid >= 0 ? row[idx.paid] : 0) || 0;
        const loanBalance = Number(idx.bal >= 0 ? row[idx.bal] : 0) || 0;
        const dateVal = idx.date >= 0 ? row[idx.date] : null;

        docs.push({
          collectorId, // who this batch belongs to
          agentNo,
          loanAmount,
          amountPaid,
          loanBalance,
          date: coerceDate(dateVal) || new Date(),
          createdAt: new Date(),
        });
      }

      if (docs.length) await Payment.insertMany(docs);

      res.json({ ok: true, inserted: docs.length, file: saved });
    } catch (e) {
      res.status(500).json({ error: e.message || "Failed to parse file" });
    }
  }
);

// ---------- ACCOUNTS (scoped) ----------
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
      const collectorId = req.query.collectorId || req.body.collectorId || null;

      const saved = await FileModel.create({
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/accounts/${req.file.filename}`,
        size: req.file.size,
        type: "accounts",
        collectorId,
      });
      res.json({ ok: true, file: saved });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

app.get("/api/accounts/files", async (req, res) => {
  try {
    const role = String(req.query.role || "").toLowerCase();
    const collectorId = req.query.collectorId || null;

    const q = { type: "accounts" };
    if (role === "collector") {
      if (!collectorId) return res.json([]);
      q.collectorId = collectorId;
    } else if (collectorId) {
      q.collectorId = collectorId;
    }

    const files = await FileModel.find(q).sort({ createdAt: -1 }).limit(200).lean();
    const out = (files || []).map((f) => ({
      name: f.originalName || f.filename,
      filename: f.filename,
      size: f.size,
      createdAt: f.createdAt,
      uploadedAt: f.createdAt,
      url: f.path || `/uploads/accounts/${f.filename}`,
      collectorId: f.collectorId || null,
    }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- REPORTS (optional scoped like accounts) ----------
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
      const collectorId = req.query.collectorId || req.body.collectorId || null;

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
    const role = String(req.query.role || "").toLowerCase();
    const collectorId = req.query.collectorId || null;

    const q = { type: "reports" };
    if (role === "collector") {
      if (!collectorId) return res.json([]);
      q.$or = [{ collectorId: collectorId }, { collectorId: null }];
    } else if (collectorId) {
      q.collectorId = collectorId;
    }

    const files = await FileModel.find(q).sort({ createdAt: -1 }).limit(200).lean();
    const out = (files || []).map((f) => ({
      name: f.originalName || f.filename,
      filename: f.filename,
      size: f.size,
      createdAt: f.createdAt,
      uploadedAt: f.createdAt,
      url: f.path || `/uploads/reports/${f.filename}`,
      collectorId: f.collectorId || null,
    }));
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

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server at http://${HOST}:${PORT}`);
  console.log(`📁 Serving frontend from: ${FRONTEND_DIR}`);
  console.log(`📂 Serving uploads from: ${UPLOAD_DIR} -> /uploads`);
});

