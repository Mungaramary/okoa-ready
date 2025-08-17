require("dotenv").config();
const mongoose = require("mongoose");
const Payment = require("./models/Payment");

const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/okoa_dashboard";

async function run() {
  await mongoose.connect(MONGO, { useNewUrlParser:true, useUnifiedTopology:true });

  const count = await Payment.countDocuments();
  if (count > 0) {
    console.log("Seed skipped: payments already exist ("+count+")");
    await mongoose.disconnect();
    return;
  }

  const agents = ["A001","A002","A003","A004","A005"];
  const docs = [];
  const today = new Date();

  for (let d=0; d<7; d++){
    const base = new Date(today);
    base.setHours(10,0,0,0);
    base.setDate(today.getDate()-d);
    const rows = Math.floor(Math.random()*8)+5;
    for (let i=0;i<rows;i++){
      const loanAmount = Math.floor(Math.random()*20000)+2000;
      const amountPaid = Math.floor(Math.random()*loanAmount*0.6);
      const loanBalance = loanAmount - amountPaid;
      docs.push({
        firstName: "Agent"+d+i,
        msisdn: "2547"+(Math.floor(10000000+Math.random()*89999999)),
        agentNo: agents[Math.floor(Math.random()*agents.length)],
        loanAmount, amountPaid, loanBalance,
        date: new Date(base.getTime() + Math.floor(Math.random()*6)*3600*1000),
        createdAt: new Date()
      });
    }
  }
  const inserted = await Payment.insertMany(docs);
  console.log("Seed complete â€” inserted", inserted.length);
  await mongoose.disconnect();
}

run().catch(e=>{ console.error(e); process.exit(1); });
