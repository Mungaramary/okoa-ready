
const mongoose = require("mongoose");
const FileSchema = new mongoose.Schema(
  {
    originalName: { type: String },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    size: { type: Number, default: 0 },
    type: { type: String, default: "misc", index: true },
    collectorId: { type: mongoose.Schema.Types.Mixed, index: true }
  },
  { timestamps: true }
);
module.exports = mongoose.model("File", FileSchema);
