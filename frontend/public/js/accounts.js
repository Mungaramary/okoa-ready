// frontend/public/js/accounts.js
import { apiFetch, getUser, attachLogout, displayDateMMDDYYYY } from "./auth.js";
attachLogout();

const me = getUser(); // { role, collectorId, name, ... }

const uploadInput = document.querySelector('#accountsUploadInput') || document.querySelector('input[type="file"]');
const uploadBtn   = document.querySelector('#accountsUploadBtn')   || Array.from(document.querySelectorAll("button")).find(b=>/upload/i.test(b.textContent));
const whoEl       = document.querySelector('#accountAssignee')     || document.querySelector('select#accountAssignee');
const listEl      = document.querySelector('#accountsList')        || document.querySelector('tbody#accountsTbody') || document.querySelector('tbody');

function normalizeCollectorId(x) {
  if (!x) return "";
  const v = String(x).toLowerCase().trim();
  if (/collector\s*1/.test(v)) return "collector-1";
  if (/collector\s*2/.test(v)) return "collector-2";
  if (/collector\s*3/.test(v)) return "collector-3";
  if (/^collector-\d+/.test(v)) return v;
  return v;
}

// Fill assignee dropdown if TL
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

async function loadList(){
  const params = new URLSearchParams();
  const role = (me?.role||"").toLowerCase();
  params.set("role", role);
  if (role==="collector" && me?.collectorId) params.set("collectorId", me.collectorId);
  // TL can add a filter via UI if you have a dropdown; otherwise omit

  const r = await apiFetch(`/api/accounts/files?${params.toString()}`);
  const list = await r.json().catch(()=>[]);
  render(list);
}

function render(list){
  if (!listEl) return;
  if (!Array.isArray(list) || !list.length){
    listEl.innerHTML = `<tr><td colspan="4" class="muted">No files yet</td></tr>`;
    return;
  }
  listEl.innerHTML = list.map(f=>{
    const when = f.createdAt ? displayDateMMDDYYYY(new Date(f.createdAt)) : "-";
    return `
      <tr>
        <td>${f.name}</td>
        <td>${f.collectorId || "-"}</td>
        <td>${when}</td>
        <td><a href="${f.url}" target="_blank">Open</a></td>
      </tr>
    `;
  }).join("");
}

// Upload (scoped to collector)
async function doUpload(){
  if (!uploadInput?.files?.length) return alert("Choose a file first");
  const fd = new FormData();
  fd.append("file", uploadInput.files[0]);

  const role = (me?.role||"").toLowerCase();
  let collectorId = "";
  if (role==="team_leader") collectorId = normalizeCollectorId(whoEl?.value || "");
  else collectorId = me?.collectorId || "collector-1";

  const url = collectorId
    ? `/api/accounts/upload?collectorId=${encodeURIComponent(collectorId)}`
    : `/api/accounts/upload`;

  const r = await apiFetch(url, { method:"POST", body: fd });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) return alert(j.error || "Upload failed");
  uploadInput.value = "";
  await loadList();
}

// Optional: improve XLSX preview date conversion if you show a preview table
// If you render cells and hit raw numbers like 452673, convert likely Excel dates:
export function maybeExcelSerialToDate(n){
  if (typeof n==="number" && n>40000 && n<60000){
    // same math as backend
    const utcDays = Math.floor(n - 25569);
    const frac = n - Math.floor(n);
    const utcSeconds = utcDays * 86400 + Math.round(frac * 86400);
    const d = new Date(utcSeconds * 1000);
    if (!isNaN(d)) return displayDateMMDDYYYY(d);
  }
  return n;
}

if (uploadBtn && !uploadBtn._bound){
  uploadBtn._bound = true;
  uploadBtn.addEventListener("click",(e)=>{ e.preventDefault(); doUpload(); });
}

loadList();
