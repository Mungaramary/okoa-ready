// frontend/public/js/payments.js
import { apiFetch, getUser, attachLogout, displayDateMMDDYYYY } from "./auth.js";
attachLogout();

const me = getUser();

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
  if (/^collector-\d+$/.test(v)) return v;
  return v;
}

(function initAssignee(){
  if (!whoEl) return;
  const role = (me?.role||"").toLowerCase();
  if (role==="team_leader"){
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

function fmtNum(n){ const v = Number(n||0); return isFinite(v) ? v.toLocaleString() : String(n||""); }

async function loadPayments(){
  const params = new URLSearchParams();
  const role = (me?.role||"").toLowerCase();

  if (role==="collector" && me?.collectorId) {
    params.set("collectorId", me.collectorId);
  } else if (role==="team_leader" && whoEl?.value){
    params.set("collectorId", normalizeCollectorId(whoEl.value));
  }

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
        <td>${p.collectorId || "-"}</td>
        <td>${p.agentNo ?? ""}</td>
        <td>${fmtNum(p.loanAmount)}</td>
        <td>${fmtNum(p.amountPaid)}</td>
        <td>${fmtNum(p.loanBalance)}</td>
        <td>${d}</td>
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

  if (!collectorId) return alert("Select a collector");

  const url = `/api/payments/upload?collectorId=${encodeURIComponent(collectorId)}`;

  const oldLabel = uploadBtn?.textContent || "Upload";
  if (uploadBtn){ uploadBtn.disabled = true; uploadBtn.textContent = "Uploading…"; }

  const r = await apiFetch(url, { method:"POST", body: fd });
  const j = await r.json().catch(()=>({}));
  if (uploadBtn){ uploadBtn.disabled = false; }

  if (!r.ok || !j.ok) {
    if (uploadBtn) uploadBtn.textContent = oldLabel;
    return alert(j.error || "Upload failed");
  }

  if (uploadInput) uploadInput.value = "";
  if (uploadBtn){ uploadBtn.textContent = "Uploaded"; setTimeout(()=> uploadBtn.textContent = oldLabel, 1200); }
  await loadPayments();
}

if (whoEl) whoEl.addEventListener("change", ()=> loadPayments());
if (uploadBtn && !uploadBtn._bound){
  uploadBtn._bound = true;
  uploadBtn.addEventListener("click",(e)=>{ e.preventDefault(); doUpload(); });
}

loadPayments();


