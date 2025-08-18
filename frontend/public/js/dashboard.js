// frontend/public/js/dashboard.js
import { apiFetch, getUser, attachLogout } from "./auth.js";
attachLogout();

const me = getUser();

const paidEl = document.querySelector('#dashTotalPaid');
const balEl  = document.querySelector('#dashTotalBalance');
const barCanvas = document.getElementById("paidVsBalance");

async function loadStats(){
  const params = new URLSearchParams();
  if ((me?.role||"").toLowerCase()==="collector" && me?.collectorId){
    params.set("collectorId", me.collectorId);
  }
  const r = await apiFetch(`/api/payments?${params.toString()}`);
  const rows = await r.json().catch(()=>[]);

  const totalPaid = rows.reduce((s,p)=> s + Number(p.amountPaid||0), 0);
  const totalBalance = rows.reduce((s,p)=> s + Number(p.loanBalance||0), 0);

  if (paidEl) paidEl.textContent = totalPaid.toLocaleString();
  if (balEl)  balEl.textContent  = totalBalance.toLocaleString();

  if (barCanvas && window.Chart){
    const ctx = barCanvas.getContext("2d");
    if (window._pvb) window._pvb.destroy();
    window._pvb = new Chart(ctx, {
      type: "bar",
      data: { labels: ["Paid", "Outstanding"], datasets: [{ label:"KES", data:[totalPaid, totalBalance] }] },
      options: { responsive: true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } }
    });
  }
}

loadStats();

