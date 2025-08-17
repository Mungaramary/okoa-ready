
const mongoose = require("mongoose");
const TaskSchema = new mongoose.Schema(
  { title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["open","in_progress","done"], default: "open", index: true },
    dueDate: { type: Date, default: null },
    assignedTo: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.Mixed, required: true, index: true }, },
  { timestamps: true }
);
module.exports = mongoose.model("Task", TaskSchema);
