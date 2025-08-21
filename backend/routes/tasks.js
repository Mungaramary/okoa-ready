// backend/routes/tasks.js
// Router is self-contained (no db argument). It uses mongoose.connection.db
// lazily inside each handler so routes exist immediately and start working
// as soon as Mongo is connected.

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

// Ensure uploads dir for task attachments exists
const uploadsDir = path.join(__dirname, "..", "uploads", "tasks");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

function getTasksCollection() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return db.collection("tasks");
}

// Normalize collector ids (e.g. "Collector 2" → "collector-2")
function normalizeCollectorId(x) {
  if (!x) return "";
  const v = String(x).toLowerCase().trim();
  if (/collector\s*1/.test(v)) return "collector-1";
  if (/collector\s*2/.test(v)) return "collector-2";
  if (/collector\s*3/.test(v)) return "collector-3";
  if (/^collector-\d+/.test(v)) return v;
  return v;
}

// ISO date helper
function toDateSafe(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

module.exports = function tasksRouter() {
  const router = express.Router();

  // GET /api/tasks?role=team_leader|collector&collectorId=collector-1&me=TLName
  router.get("/tasks", async (req, res) => {
    try {
      const Tasks = getTasksCollection();
      if (!Tasks) return res.status(503).json({ error: "DB not ready" });

      const role = String(req.query.role || "").toLowerCase();
      const collectorId = normalizeCollectorId(req.query.collectorId || "");
      const me = req.query.me || null;

      let filter = {};
      if (role === "collector" && collectorId) {
        filter = { assignedTo: collectorId };
      } else if (role === "team_leader") {
        if (me) filter = { createdBy: me };
      }

      const items = await Tasks.find(filter).sort({ createdAt: -1 }).toArray();
      res.json(items);
    } catch (e) {
      console.error("GET /api/tasks failed:", e);
      res.status(500).json({ error: "Failed to load tasks" });
    }
  });

  // POST /api/tasks  { title, description, assignedTo, dueDate, createdBy, createdByName }
  router.post("/tasks", express.json(), async (req, res) => {
    try {
      const Tasks = getTasksCollection();
      if (!Tasks) return res.status(503).json({ error: "DB not ready" });

      const b = req.body || {};
      const title = (b.title || "").trim();
      if (!title) return res.status(400).json({ error: "Missing title" });

      let assignedTo = normalizeCollectorId(b.assignedTo || "");
      if (!assignedTo) assignedTo = "collector-1";

      const doc = {
        title,
        description: String(b.description || "").trim(),
        assignedTo,
        dueDate: toDateSafe(b.dueDate),
        status: "Open",
        createdAt: new Date(),
        createdBy: b.createdBy || null,
        createdByName: b.createdByName || null,
        attachments: [],
      };

      const r = await Tasks.insertOne(doc);
      return res.json({ ok: true, id: r.insertedId, task: { _id: r.insertedId, ...doc } });
    } catch (e) {
      console.error("POST /api/tasks failed:", e);
      res.status(500).json({ error: e.message || "Failed to create task" });
    }
  });

  // PATCH /api/tasks/:id/status  { status: "Open" | "Done" }
  router.patch("/tasks/:id/status", express.json(), async (req, res) => {
    try {
      const Tasks = getTasksCollection();
      if (!Tasks) return res.status(503).json({ error: "DB not ready" });

      const { id } = req.params;
      const { status } = req.body || {};
      if (!["Open", "Done"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const r = await Tasks.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
      if (!r.matchedCount) return res.status(404).json({ error: "Task not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("PATCH /api/tasks/:id/status failed:", e);
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // POST /api/tasks/:id/attach  (FormData: file)
  router.post("/tasks/:id/attach", upload.single("file"), async (req, res) => {
    try {
      const Tasks = getTasksCollection();
      if (!Tasks) return res.status(503).json({ error: "DB not ready" });

      const { id } = req.params;
      if (!req.file) return res.status(400).json({ error: "No file" });

      const file = {
        name: req.file.originalname,
        path: `/uploads/tasks/${req.file.filename}`,
        size: req.file.size,
        uploadedAt: new Date(),
      };

      const r = await Tasks.updateOne({ _id: new ObjectId(id) }, { $push: { attachments: file } });
      if (!r.matchedCount) return res.status(404).json({ error: "Task not found" });

      res.json({ ok: true, file });
    } catch (e) {
      console.error("POST /api/tasks/:id/attach failed:", e);
      res.status(500).json({ error: "Failed to upload attachment" });
    }
  });

  return router;
};


