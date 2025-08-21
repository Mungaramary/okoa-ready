// backend/routes/tasks.js
const express = require("express");
const Task = require("../models/Task");

// export a factory to match your server.js usage
module.exports = function tasksRouterFactory(_db) {
  const router = express.Router();

  // Normalise "me" like "tl" or "collector-2"
  function norm(v) {
    return String(v || "").trim().toLowerCase();
  }

  // GET /api/tasks?me=tl or me=collector-1
  router.get("/tasks", async (req, res) => {
    try {
      const me = norm(req.query.me);
      if (!me) return res.status(400).json({ error: "Missing me" });

      let q = {};
      if (me === "tl") {
        // TL: see everything
        q = {};
      } else {
        // collectors: see tasks assigned to them or created by them
        q = { $or: [{ assignedTo: me }, { createdBy: me }] };
      }

      const rows = await Task.find(q).sort({ createdAt: -1 }).limit(500).lean();
      res.json(rows || []);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/tasks  body: { title, details, dueDate, assignedTo, createdBy }
  router.post("/tasks", async (req, res) => {
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

  // PATCH /api/tasks/:id  body: { status? , title? , details? , dueDate? , assignedTo? }
  router.patch("/tasks/:id", async (req, res) => {
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

  // DELETE /api/tasks/:id
  router.delete("/tasks/:id", async (req, res) => {
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

  return router;
};



