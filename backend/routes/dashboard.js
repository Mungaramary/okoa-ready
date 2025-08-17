// backend/routes/dashboard.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const { requireAny } = require("../middleware/roleGuard");

// Returns aggregated dashboard data for charts/KPIs.
// Response shape:
// { days: [{ date: 'YYYY-MM-DD', totalCollected: Number, totalOutstanding: Number }], now: ISOString }
router.get("/dashboard-data", requireAny, async (req, res) => {
  try {
    const me = req.user || {};
    const q = {};
    if (me.role === "collector") {
      q.collectorId = mongoose.Types.ObjectId.isValid(me.id) ? new mongoose.Types.ObjectId(me.id) : me.id;
    } else if (me.role === "team_leader" && req.query.collectorId) {
      const cid = req.query.collectorId;
      q.collectorId = mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid;
    }

    // last 14 days
    const since = new Date(Date.now() - 14*24*60*60*1000);
    q.date = { $gte: since }; // rely on Payment.date (uploaded row date)
    // Fallback: if no date present, use createdAt
    const pipeline = [
      { $match: q },
      { $addFields: { day: { $dateToString: { date: { $ifNull: ["$date", "$createdAt"] }, format: "%Y-%m-%d" } } } },
      { $group: {
        _id: "$day",
        totalCollected: { $sum: { $ifNull: ["$amountPaid", 0] } },
        totalOutstanding: { $sum: { $ifNull: ["$loanBalance", 0] } },
      } },
      { $project: { _id: 0, date: "$_id", totalCollected: 1, totalOutstanding: 1 } },
      { $sort: { date: 1 } },
    ];

    const rows = await Payment.aggregate(pipeline);
    res.json({ days: rows, now: new Date().toISOString() });
  } catch (e) {
    console.error("dashboard-data error:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
