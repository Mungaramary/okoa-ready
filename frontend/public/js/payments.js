// frontend/public/js/payments.js
import { apiFetch, getUser, attachLogout, displayDateMMDDYYYY } from "./auth.js";
attachLogout();

const me = getUser(); // { role, collectorId, ... }

const uploadInput = document.querySelector('#paymentsUploadInput') || document.querySelector('input[type="file"]');
const uploadBtn   = document.querySelector('#paymentsUploadBtn')   || Array.from(document.querySelectorAll("button")).find(b=>/upload/i.test(b.textContent));
const whoEl       = document.querySelector('#paymentsAssignee')    || document.querySelector('select#paymentsAssignee');
const tableBody   = document.querySelector('#paymentsTbody')       || document.querySelector('tbody');

function normalizeCollectorId(x) {
  if (!x) return "";
  const v = String(x).toLowerCase().trim();
  if (/collector\s*1/.test(v)) return "collector-1";
  if (/collector\s*2/.test(v)) return "collector-2";
  if (/collector\s*3/.test(v)) return "collector-3";
  if (/^collector-\d+/.test(v)) return v;
  return v;
}

(function initAssignee(){
  if (!whoEl) return;
  if ((me?.role||"").toLowerCase()==="team_leader"){
    whoEl.innerHTML = `
      <option value="collector-1">Collector 1</option>
      <option value="collector-2">Collector 2</option>
      <option value="collector-3">Collector 3</option>
    `;
  } else {
    const mine = me?.collectorId || "collector-1";
    whoEl.innerHTML = `<option value="${mine}">Me</option>`;
    whoEl.disabled = true;
  }
})();

async function loadPayments(){
  const params = new URLSearchParams();
  const role = (me?.role||"").toLowerCase();
  if (role==="collector" && me?.collectorId) params.set("collectorId", me.collectorId);
  // TL: if you have a selector to view a collector’s data, set params.set("collectorId", whoEl.value)

  const r = await apiFetch(`/api/payments?${params.toString()}`);
  const rows = await r.json().catch(()=>[]);
  render(rows);
}

function render(rows){
  if (!tableBody) return;
  if (!Array.isArray(rows) || !rows.length){
    tableBody.innerHTML = `<tr><td colspan="6" class="muted">No payments</td></tr>`;
    return;
  }
  tableBody.innerHTML = rows.map(p=>{
    const d = p.date ? displayDateMMDDYYYY(new Date(p.date)) : "-";
    return `
      <tr>
        <td>${p.agentNo ?? ""}</td>
        <td>${p.loanAmount ?? 0}</td>
        <td>${p.amountPaid ?? 0}</td>
        <td>${p.loanBalance ?? 0}</td>
        <td>${d}</td>
        <td>${p.collectorId || "-"}</td>
      </tr>
    `;
  }).join("");
}

async function doUpload(){
  if (!uploadInput?.files?.length) return alert("Choose a file first");
  const fd = new FormData();
  fd.append("file", uploadInput.files[0]);

  const role = (me?.role||"").toLowerCase();
  let collectorId = "";
  if (role==="team_leader") collectorId = normalizeCollectorId(whoEl?.value || "");
  else collectorId = me?.collectorId || "collector-1";

  const url = collectorId
    ? `/api/payments/upload?collectorId=${encodeURIComponent(collectorId)}`
    : `/api/payments/upload`;

  const r = await apiFetch(url, { method:"POST", body: fd });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) return alert(j.error || "Upload failed");

  uploadInput.value = "";
  await loadPayments();
}

if (uploadBtn && !uploadBtn._bound){
  uploadBtn._bound = true;
  uploadBtn.addEventListener("click",(e)=>{ e.preventDefault(); doUpload(); });
}

loadPayments();

