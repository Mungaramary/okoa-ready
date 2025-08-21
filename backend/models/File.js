// backend/models/File.js
const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    size: { type: Number, default: 0 },
    type: { type: String, index: true, required: true }, // 'accounts' | 'payments' | 'reports'
    collectorId: { type: String, index: true, default: null }, // <- IMPORTANT
  },
  { timestamps: true }
);

module.exports = mongoose.model("File", fileSchema);
