const express = require('express');
const router = express.Router();
const path = require("path"), fs = require("fs");
const multer = require("multer");
const XLSX = require("xlsx");
const Payment = require("../models/Payment");
const { requireAny } = require("../middleware/roleGuard");

const PAY_DIR = path.join(__dirname, "..", "uploads", "payments");
fs.mkdirSync(PAY_DIR, { recursive: true });
const upload = multer({ dest: PAY_DIR });

// ---------- helpers ----------
function toNum(v){
  const n = Number((v ?? "").toString().replace(/[, \t]/g,""));
  return isNaN(n) ? 0 : n;
}

// Excel serial → JS Date
function excelDateToJS(serial){
  if (typeof serial !== "number" || !isFinite(serial)) return null;
  // Excel epoch 1899-12-30 (with 1900 leap-year bug accounted)
  const utcDays = Math.floor(serial - 25569);
  const frac = serial - Math.floor(serial);
  const utcSeconds = utcDays * 86400 + Math.round(frac * 86400);
  const d = new Date(utcSeconds * 1000);
  return isNaN(d) ? null : d;
}

function toDateFlexible(v){
  if (v == null || v === "") return null;

  if (typeof v === "number") {
    const d = excelDateToJS(v);
    if (d) return d;
  }

  // normalize separators
  const s = String(v).trim().replace(/[.]/g,"/");

  // try native parse first
  const d1 = new Date(s);
  if (!isNaN(d1)) return d1;

  // dd/mm/yyyy or d/m/yy fallback
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m){
    let d = parseInt(m[1],10), mo = parseInt(m[2],10), y = parseInt(m[3],10);
    if (y < 100) y += 2000;
    const jd = new Date(y, mo-1, d);
    if (!isNaN(jd)) return jd;
  }
  return null;
}

// ---------- GET /api/payments ----------
router.get("/", requireAny, async (req, res) => {
  try {
    const me = req.user || {};
    const q = {};
    if (me.role === "collector") q.collectorId = me.id;
    else if (me.role === "team_leader" && req.query.collectorId) q.collectorId = req.query.collectorId;

    const rows = await Payment.find(q)
      .sort({ date: -1, createdAt: -1 })
      .limit(1000)            // safety cap
      .lean();

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST /api/payments/upload ----------
router.post("/upload", requireAny, upload.single("file"), async (req, res) => {
  try {
    const me = req.user || {};
    if (me.role !== "team_leader") return res.status(403).json({ error: "Only Team Leader can upload payments" });
    if (!req.file) return res.status(400).json({ error: "No file" });

    const collectorId = req.body.collectorId || "collector1";

    // parse workbook
    const buf = fs.readFileSync(req.file.path);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // map rows
    const mapped = rows.map(r => {
      const dateRaw = r.date ?? r.Date ?? r.createdAt ?? r["Created At"];
      return {
        collectorId,
        agentNo: String(r.agentNo ?? r.Agent ?? r.agent ?? r.AGENT ?? "").trim(),
        loanAmount:  toNum(r.loanAmount ?? r.LoanAmount ?? r["Loan Amount"] ?? r.loan ?? r.Loan),
        amountPaid:  toNum(r.amountPaid ?? r.AmountPaid ?? r["Amount Paid"] ?? r.paid ?? r.Paid),
        loanBalance: toNum(r.loanBalance ?? r.LoanBalance ?? r["Loan Balance"] ?? r.balance ?? r.Balance),
        date: toDateFlexible(dateRaw)
      };
    }).filter(x => (x.agentNo || x.loanAmount || x.amountPaid || x.loanBalance));

    // Upsert by (collectorId, agentNo, date) to avoid duplicates on re-upload
    if (mapped.length){
      const ops = mapped.map(doc => ({
        updateOne: {
          filter: { collectorId: doc.collectorId, agentNo: doc.agentNo, date: doc.date || null },
          update: { $set: doc },
          upsert: true
        }
      }));
      await Payment.bulkWrite(ops, { ordered: false });
    }

    res.json({ ok: true, message: `Processed ${mapped.length} payments` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

