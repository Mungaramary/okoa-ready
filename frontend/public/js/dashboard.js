// frontend/public/js/dashboard.js
import { apiFetch, getUser, attachLogout } from "./auth.js";
attachLogout();

const me = getUser();

async function loadStats(){
  const params = new URLSearchParams();
  if ((me?.role||"").toLowerCase()==="collector" && me?.collectorId){
    params.set("collectorId", me.collectorId);
  }
  // Example: if you compute totals client-side
  const r = await apiFetch(`/api/payments?${params.toString()}`);
  const rows = await r.json().catch(()=>[]);
  const totalPaid = rows.reduce((s,p)=> s + Number(p.amountPaid||0), 0);
  const totalBalance = rows.reduce((s,p)=> s + Number(p.loanBalance||0), 0);

  const paidEl = document.querySelector('#dashTotalPaid');
  const balEl  = document.querySelector('#dashTotalBalance');
  if (paidEl) paidEl.textContent = totalPaid.toLocaleString();
  if (balEl)  balEl.textContent  = totalBalance.toLocaleString();
}

loadStats();
