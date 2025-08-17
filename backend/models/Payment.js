
const mongoose = require("mongoose");
const PaymentSchema = new mongoose.Schema({
  collectorId: { type: mongoose.Schema.Types.Mixed, index: true },
  agentNo: { type: String, default: "" },
  loanAmount: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  loanBalance: { type: Number, default: 0 },
  date: { type: Date },
}, { timestamps: true });
module.exports = mongoose.model("Payment", PaymentSchema);
