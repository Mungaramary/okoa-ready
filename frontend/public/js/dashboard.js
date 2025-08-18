// frontend/public/js/dashboard.js
import { apiFetch, getUser, attachLogout } from "./auth.js";
attachLogout();

const me = getUser();

const paidEl = document.querySelector('#dashTotalPaid');
const balEl  = document.querySelector('#dashTotalBalance');

const paidVsBalCanvas = document.getElementById("paidVsBalance"); // create <canvas id="paidVsBalance"></canvas> if not present

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

  // Draw chart if Chart.js available
  if (paidVsBalCanvas && window.Chart){
    const ctx = paidVsBalCanvas.getContext("2d");
    if (window._paidVsBalChart) window._paidVsBalChart.destroy();
    window._paidVsBalChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Paid", "Outstanding"],
        datasets: [{
          label: "KES",
          data: [totalPaid, totalBalance],
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
}

loadStats();
