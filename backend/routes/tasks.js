
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Task = require("../models/Task");
const { requireAny } = require("../middleware/roleGuard");
function castId(v) { if (!v) return v; return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : String(v); }
router.get("/", requireAny, async (req, res) => {
  try {
    const me = req.user || {};
    const q = {};
    if (me.role === "collector") q.assignedTo = castId(me.id);
    else if (me.role === "team_leader" && req.query.collectorId) q.assignedTo = castId(req.query.collectorId);
    const tasks = await Task.find(q).sort({ createdAt: -1 }).lean();
    res.json({ tasks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post("/", requireAny, async (req, res) => {
  try {
    const me = req.user || {};
    const { title, description, dueDate, assignedTo } = req.body || {};
    if (!title) return res.status(400).json({ error: "Missing title" });
    let assign = assignedTo;
    if (me.role === "collector") assign = me.id;
    else if (me.role === "team_leader" && !assign) return res.status(400).json({ error: "Missing assignedTo" });
    const doc = await Task.create({
      title: String(title).trim(),
      description: String(description || ""),
      dueDate: dueDate ? new Date(dueDate) : null,
      assignedTo: castId(assign), createdBy: castId(me.id), status: "open",
    });
    res.json({ ok: true, task: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch("/:id", requireAny, async (req, res) => {
  try {
    const me = req.user || {}; const isTL = me.role === "team_leader"; const { id } = req.params;
    const current = await Task.findById(id).lean(); if (!current) return res.status(404).json({ error: "Task not found" });
    if (!isTL) { const mine = String(current.assignedTo) === String(castId(me.id)); if (!mine) return res.status(403).json({ error: "Not allowed" }); if (!("status" in req.body)) return res.status(400).json({ error: "Collectors can only update status" }); }
    const update = {}; if ("status" in req.body) update.status = req.body.status;
    if (isTL) { if ("title" in req.body) update.title = req.body.title; if ("description" in req.body) update.description = req.body.description || ""; if ("dueDate" in req.body) update.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null; if ("assignedTo" in req.body) update.assignedTo = castId(req.body.assignedTo); }
    const updated = await Task.findByIdAndUpdate(id, { $set: update }, { new: true });
    res.json({ ok: true, task: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete("/:id", requireAny, async (req, res) => {
  try {
    const me = req.user || {}; if (me.role !== "team_leader") return res.status(403).json({ error: "Not allowed" });
    await Task.findByIdAndDelete(req.params.id); res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
