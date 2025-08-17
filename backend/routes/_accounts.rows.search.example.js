// backend/routes/accounts.js (rows search support)
const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const Account = require('../models/Account');
const { requireAny } = require('../middleware/roleGuard');

router.get('/rows', requireAny, async (req, res) => {
  try {
    const page  = Math.max(0, parseInt(req.query.page || "0", 10));
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || "50", 10)));
    const search = (req.query.search || "").trim();
    const q = {};
    if (req.user?.role === "collector") {
      q.collectorId = mongoose.Types.ObjectId.isValid(req.user.id) ? new mongoose.Types.ObjectId(req.user.id) : req.user.id;
    } else if (req.user?.role === "team_leader" && req.query.collectorId) {
      const cid = req.query.collectorId;
      q.collectorId = mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid;
    }
    if (search) {
      q.$or = [
        { firstName: new RegExp(search, "i") },
        { otherName: new RegExp(search, "i") },
        { msisdn: new RegExp(search, "i") },
        { agentNo: new RegExp(search, "i") },
        { storeNo: new RegExp(search, "i") },
        { businessName: new RegExp(search, "i") },
        { location: new RegExp(search, "i") },
      ];
    }
    const [docs, total] = await Promise.all([
      Account.find(q).sort({ createdAt: -1 }).skip(page * limit).limit(limit).lean(),
      Account.countDocuments(q)
    ]);
    const rows = docs.map(d => ({ ...d, createdAtSrc: d.createdAt }));
    res.json({ page, limit, total, rows });
  } catch (e) {
    res.status(500).json({ error:e.message });
  }
});

module.exports = router;
