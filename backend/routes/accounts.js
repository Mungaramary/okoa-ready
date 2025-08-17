const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require("path"), fs = require("fs");
const multer = require("multer");
const XLSX = require("xlsx");
const File = require("../models/File");
const Account = require("../models/Account");
const { requireAny } = require("../middleware/roleGuard");

const ACC_DIR = path.join(__dirname, "..", "uploads", "accounts");
fs.mkdirSync(ACC_DIR, { recursive: true });
const upload = multer({ dest: ACC_DIR });

function toNum(v){ const n = Number((v||"").toString().replace(/[,\\s]/g,"")); return isNaN(n) ? 0 : n; }
function toDate(v){ const d=new Date(v); return isNaN(d) ? null : d; }

// -------- Upload (Team Leader) --------
router.post("/upload", requireAny, upload.single("file"), async (req, res) => {
  try {
    const me = req.user || {};
    if (me.role !== "team_leader") return res.status(403).json({ error: "Only Team Leader can upload accounts" });
    if (!req.file) return res.status(400).json({ error: "No file" });

    const collectorId = req.body.collectorId || "collector1";

    // Save file record for "Available Files"
    await File.create({
      originalName: req.file.originalname,
      filename: path.basename(req.file.path),
      path: `/uploads/accounts/${path.basename(req.file.path)}`,
      size: req.file.size,
      type: "account",
      collectorId
    });

    // Parse accounts into DB
    const buf = fs.readFileSync(req.file.path);
    let wb;
    try { wb = XLSX.read(buf, { type:"buffer" }); } 
    catch { return res.json({ ok:true, message:"Uploaded (preview only)" }); }

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval:"" });

    // Replace existing rows for that collector
    await Account.deleteMany({ collectorId });

    const mapped = rows.map(raw => ({
      collectorId,
      // standardized extracts (still useful for charts/search)
      firstName: raw.firstName || raw.FirstName || raw["First Name"] || raw.customer || raw.Customer || "",
      otherName: raw.otherName || raw.OtherName || raw["Other Name"] || raw.surname || raw.Surname || "",
      msisdn:    raw.msisdn || raw.MSISDN || raw.phone || raw.Phone || "",
      loanAmount:    toNum(raw.loanAmount || raw.LoanAmount || raw["Loan Amount"] || raw.loan || raw.Loan),
      amountPaid:    toNum(raw.amountPaid || raw.AmountPaid || raw["Amount Paid"] || raw.paid || raw.Paid),
      loanBalance:   toNum(raw.loanBalance || raw.LoanBalance || raw["Loan Balance"] || raw.balance || raw.Balance),
      status: raw.status || raw.Status || "",
      createdAtSrc:  toDate(raw.createdAt || raw.CreatedAt || raw["Created At"] || raw.date || raw.Date),
      lastInterestCalc: toDate(raw.lastInterestCalc || raw["Last Interest Calc"] || raw.lastCalc || raw["Last Calc"]),
      // keep everything from the original row
      raw
    }));

    if (mapped.length) await Account.insertMany(mapped);
    res.json({ ok: true, message: `Uploaded ${mapped.length} rows` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------- Files list (for "Available Files") --------
router.get("/files", requireAny, async (req, res) => {
  try {
    const me = req.user || {};
    const q = { type: "account" };
    if (me.role === "collector") q.collectorId = me.id;
    else if (me.role === "team_leader" && req.query.collectorId) q.collectorId = req.query.collectorId;

    const docs = await File.find(q).sort({ createdAt: -1 }).limit(100).lean();
    const out = docs.map(f => ({
      name: f.originalName || f.filename,
      filename: f.filename,
      url: f.path || `/uploads/accounts/${f.filename}`,
      uploadedAt: f.createdAt,
      size: f.size
    }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------- Rows with dynamic, de-duplicated columns --------
router.get("/rows", requireAny, async (req, res) => {
  try {
    const me = req.user || {};
    const page  = Math.max(0, parseInt(req.query.page||"0",10));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit||"50",10)));
    const search = (req.query.search||"").trim();

    const q = {};
    if (me.role === "collector") q.collectorId = me.id;
    else if (me.role === "team_leader" && req.query.collectorId) q.collectorId = req.query.collectorId;

    // Keep search simple & safe on standardized fields
    if (search) {
      q.$or = [
        { firstName: new RegExp(search, "i") },
        { otherName: new RegExp(search, "i") },
        { msisdn: new RegExp(search, "i") },
        { status: new RegExp(search, "i") }
      ];
    }

    const total = await Account.countDocuments(q);
    const docs = await Account.find(q)
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit)
      .lean();

    // Build a clean, de-duplicated column order:
    // 1) raw header names (first seen wins), 2) standardized keys not already represented
    const stdKeys = [
      "firstName","otherName","msisdn","agentNo","operatorMsisdn","businessName","location",
      "loanAmount","amountPaid","loanBalance","status","createdAtSrc","lastInterestCalc"
    ];
    const canon = k => String(k).toLowerCase().replace(/[^a-z0-9]/g,""); // normalize camel/snake/space
    const seen = new Set();
    const order = [];

    // Raw keys first (preserve sheet header names)
    for (const d of docs) {
      if (d.raw && typeof d.raw === "object") {
        for (const k of Object.keys(d.raw)) {
          const c = canon(k);
          if (c && !seen.has(c)) { seen.add(c); order.push(k); }
        }
      }
    }
    // Then standardized keys if not already represented by a similar raw key
    for (const k of stdKeys) {
      const c = canon(k);
      if (!seen.has(c)) { seen.add(c); order.push(k); }
    }

    // Flatten rows using that order (prefer raw value, fallback to standardized field)
    const rows = docs.map(d => {
      const out = {};
      for (const k of order) out[k] = (d.raw && Object.prototype.hasOwnProperty.call(d.raw, k)) ? d.raw[k] : d[k];
      return out;
    });

    res.json({ total, columns: order, rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;



