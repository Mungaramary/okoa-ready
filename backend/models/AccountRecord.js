const mongoose = require('mongoose');

const accountRecordSchema = new mongoose.Schema({
  // assignment/ownership
  collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  teamLeadId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sourceFile:  { type: String, default: '' },

  // 16 columns (normalized to camelCase)
  firstName:     { type: String, default: '' },
  otherName:     { type: String, default: '' },
  msisdn:        { type: String, default: '' },
  ownerMsisdn:   { type: String, default: '' },
  operatorMsisdn:{ type: String, default: '' },
  agentNo:       { type: String, default: '' },
  storeNo:       { type: String, default: '' },
  businessName:  { type: String, default: '' },
  location:      { type: String, default: '' },
  loanAmount:    { type: Number, default: 0 },
  loanBalance:   { type: Number, default: 0 },
  amountPaid:    { type: Number, default: 0 },
  status:        { type: String, default: '' },
  createdAtCsv:  { type: Date }, // created-at from file
  lastInterestCalc: { type: Date },
  date:          { type: Date },
  noOfDays:      { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('AccountRecord', accountRecordSchema);
