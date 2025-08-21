console.log("A) starting dev-check");
require("dotenv").config();
console.log("B) MONGODB_URI present:", !!process.env.MONGODB_URI, (process.env.MONGODB_URI||"").slice(0,35)+"...");
const express = require("express");
const app = express();
app.get("/ping", (_req,res)=>res.json({ ok:true, time:new Date().toISOString() }));
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", ()=> console.log("C) mini express UP on http://localhost:"+PORT));
