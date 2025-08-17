const mongoose = require("mongoose");

const AccountSchema = new mongoose.Schema(
  {
    collectorId: { type: mongoose.Schema.Types.Mixed, index: true },

    // standardized fields (still useful for charts / filters)
    firstName: String,
    otherName: String,
    msisdn: String,
    loanAmount: Number,
    amountPaid: Number,
    loanBalance: Number,
    status: String,
    createdAtSrc: Date,
    lastInterestCalc: Date,

    // NEW: keep the entire original row so we can show *all* columns
    raw: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Account", AccountSchema);
