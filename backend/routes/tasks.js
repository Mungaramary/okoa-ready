// backend/routes/tasks.js
// CommonJS router that plugs into your existing Express + MongoDB app.

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { ObjectId } = require("mongodb");

// Ensure uploads directory for task attachments exists
const uploadsDir = path.join(__dirname, "..", "uploads", "tasks");
fs.mkdirSync(uploadsDir, { recursive: true });

// Multer for (optional) task attachments
const upload = multer({ dest: uploadsDir });

// Normalize collector ids (e.g. "Collector 2" -> "collector-2")
function normalizeCollectorId(x) {
  if (!x) return "";
  const v = String(x).toLowerCase().trim();
  if (/collector\s*1/.test(v)) return "collector-1";
  if (/collector\s*2/.test(v)) return "collector-2";
  if (/collector\s*3/.test(v)) return "collector-3";
  if (/^collector-\d+/.test(v)) return v;
  return v;
}

/**
 * Export a factory so we can pass in the connected Mongo DB.
 * Usage in server.js:
 *   const tasksRouter = require('./routes/tasks');
 *   app.use('/api', tasksRouter(db));
 */
module.exports = function tasksRouter(db) {
  const router = express.Router();
  const Tasks = db.collection("tasks");

  // GET /api/tasks?role=team_leader|collector&collectorId=collector-1&me=TLName
  router.get("/tasks", async (req, res) => {
    try {
      const role = String(req.query.role || "").toLowerCase();
      const collectorId = normalizeCollectorId(req.query.collectorId || "");
      const me = req.query.me || null;

      let filter = {};
      if (role === "collector" && collectorId) {
        filter = { assignedTo: collectorId };
      } else if (role === "team_leader") {
        // Optionally filter by who created them (so TL sees their own)
        if (me) filter = { createdBy: me };
      }

      const items = await Tasks.find(filter).sort({ createdAt: -1 }).toArray();
      res.json(items);
    } catch (e) {
      console.error("GET /api/tasks failed", e);
      res.status(500).json({ error: "Failed to load tasks" });
    }
  });

  // POST /api/tasks  { title, description, assignedTo, dueDate, createdBy, createdByName }
  router.post("/tasks", express.json(), async (req, res) => {
    try {
      const b = req.body || {};
      const title = (b.title || "").trim();
      if (!title) return res.status(400).json({ error: "Missing title" });

      const assignedTo = normalizeCollectorId(b.assignedTo || "");
      if (!assignedTo) return res.status(400).json({ error: "Missing assignedTo" });

      const doc = {
        title,
        description: String(b.description || "").trim(),
        assignedTo,
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        status: "Open",
        createdAt: new Date(),
        createdBy: b.createdBy || null,
        createdByName: b.createdByName || null,
        attachments: [], // { name, path, size, uploadedAt }
      };

      const r = await Tasks.insertOne(doc);
      res.json({ ok: true, id: r.insertedId, task: { _id: r.insertedId, ...doc } });
    } catch (e) {
      console.error("POST /api/tasks failed", e);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  // PATCH /api/tasks/:id/status  { status: "Open" | "Done" }
  router.patch("/tasks/:id/status", express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body || {};
      if (!["Open", "Done"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const r = await Tasks.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
      if (!r.matchedCount) return res.status(404).json({ error: "Task not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("PATCH /api/tasks/:id/status failed", e);
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // POST /api/tasks/:id/attach  (FormData: file)
  router.post("/tasks/:id/attach", upload.single("file"), async (req, res) => {
    try {
      const { id } = req.params;
      if (!req.file) return res.status(400).json({ error: "No file" });

      // Public path is under /uploads/tasks/<filename>
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
      console.error("POST /api/tasks/:id/attach failed", e);
      res.status(500).json({ error: "Failed to upload attachment" });
    }
  });

  return router;
};
