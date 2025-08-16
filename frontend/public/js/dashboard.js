
import { apiFetch, displayDateMMDDYYYY, getUser } from "./auth.js";
const me = getUser();
function makeGradient(ctx, rgb, alpha){ const g = ctx.createLinearGradient(0,0,0,300); g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`); return g; }
let charts={};
function updateCharts(rows){
  const m=new Map();
  for(const r of rows||[]){
    const d = r.date ? new Date(r.date) : (r.createdAt ? new Date(r.createdAt) : null);
    if(!d || isNaN(d)) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const prev = m.get(key) || { c:0, o:0 };
    prev.c += Number(r.amountPaid)||0;
    prev.o += Number(r.loanBalance)||0;
    m.set(key, prev);
  }
  const labels = Array.from(m.keys()).sort();
  const collected = labels.map(k=>m.get(k).c);
  const outstanding = labels.map(k=>m.get(k).o);
  const colCtx=document.getElementById("collectedChart")?.getContext?.("2d");
  const outCtx=document.getElementById("outstandingChart")?.getContext?.("2d");
  const options={ responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false},
    plugins:{ legend:{display:false}, tooltip:{enabled:true,backgroundColor:"rgba(0,0,0,.8)"} },
    scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, grid:{color:"rgba(0,0,0,0.06)"}} },
    elements:{ line:{borderWidth:3,tension:0.35}, point:{radius:3,hoverRadius:5} } };
  if (colCtx){
    const data={ labels, datasets:[{ label:"Collected", data:collected, borderColor:"rgba(54,162,235,1)", backgroundColor:makeGradient(colCtx,"54,162,235",0.35), fill:true }] };
    charts.col ? (charts.col.data=data, charts.col.update()) : charts.col=new Chart(colCtx,{type:"line",data,options});
  }
  if (outCtx){
    const data={ labels, datasets:[{ label:"Outstanding", data:outstanding, borderColor:"rgba(255,99,132,1)", backgroundColor:makeGradient(outCtx,"255,99,132",0.35), fill:true }] };
    charts.out ? (charts.out.data=data, charts.out.update()) : charts.out=new Chart(outCtx,{type:"line",data,options});
  }
}
function updateRecent(rows){
  const tb=document.querySelector("#recentTable tbody");
  const last20=(rows||[]).slice(0,20);
  tb.innerHTML = last20.length ? last20.map(p=>`<tr>
    <td>${p.collectorId||""}</td>
    <td>${p.agentNo||""}</td>
    <td>${Number(p.loanAmount||0).toLocaleString()}</td>
    <td>${Number(p.amountPaid||0).toLocaleString()}</td>
    <td>${Number(p.loanBalance||0).toLocaleString()}</td>
    <td>${displayDateMMDDYYYY(p.date||p.createdAt)}</td>
  </tr>`).join("") : `<tr><td class="muted" colspan="6">No payments yet</td></tr>`;
}
async function load(){
  const qs = new URLSearchParams(location.search);
  const cid = me.role === "team_leader" ? (qs.get("collectorId")||"") : me.id;
  const url = cid ? `/api/payments?collectorId=${encodeURIComponent(cid)}` : `/api/payments`;
  const r=await apiFetch(url);
  const rows=await r.json().catch(()=>[]);
  updateRecent(rows);
  updateCharts(rows);
}
await load(); setInterval(load, 20000);
