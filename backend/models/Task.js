const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    details: { type: String, default: "" },
    dueDate: { type: Date, default: null },

    // "collector-1" | "collector-2" | "collector-3" | "tl"
    assignedTo: { type: String, required: true },
    createdBy: { type: String, required: true },

    // "open" | "done"
    status: { type: String, default: "open" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", TaskSchema);
