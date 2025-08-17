
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const path = require("path"), fs = require("fs");
const multer = require("multer");
const File = require("../models/File");
const { requireAny } = require("../middleware/roleGuard");
const REP_DIR = path.join(__dirname, "..", "uploads", "reports");
fs.mkdirSync(REP_DIR, { recursive: true });
const upload = multer({ dest: REP_DIR });
router.post("/upload", requireAny, upload.single("file"), async (req, res) => {
  try {
    const me = req.user || {};
    if (me.role !== "collector") return res.status(403).json({ error: "Only collectors can upload reports" });
    if (!req.file) return res.status(400).json({ error: "No file" });
    await File.create({
      originalName: req.file.originalname,
      filename: path.basename(req.file.path),
      path: `/uploads/reports/${path.basename(req.file.path)}`,
      size: req.file.size,
      type: "report",
      collectorId: mongoose.Types.ObjectId.isValid(me.id) ? new mongoose.Types.ObjectId(me.id) : me.id
    });
    res.json({ ok: true, message: "Report uploaded" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get("/files", requireAny, async (req, res) => {
  try {
    const me = req.user || {};
    const q = { type: "report" };
    if (me.role === "collector") q.collectorId = me.id;
    else if (me.role === "team_leader" && req.query.collectorId) { const cid = req.query.collectorId; q.collectorId = mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid; }
    const docs = await File.find(q).sort({ createdAt: -1 }).limit(200).lean();
    const out = docs.map(f => ({ name: f.originalName || f.filename, url: f.path || `/uploads/reports/${f.filename}`, uploadedAt: f.createdAt, size: f.size }));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
