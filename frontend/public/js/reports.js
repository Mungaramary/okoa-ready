// frontend/public/js/reports.js
import { apiFetch, getUser, displayDateMMDDYYYY, attachLogout } from "./auth.js";
attachLogout();

const me = getUser();
const listEl = document.getElementById("reportsList");
const uploadBtn = document.getElementById("reportUploadBtn");
const uploadInput = document.getElementById("reportFile");
const uploadStatus = document.getElementById("reportUploadStatus");

const previewWrap = document.getElementById("previewWrap");
const previewTitle = document.getElementById("previewTitle");
const sheetSelect = document.getElementById("sheetSelect");
const searchInput = document.getElementById("searchInput");
const rowsSelect = document.getElementById("rowsSelect");
const tableEl = document.getElementById("previewTable");
const thead = tableEl?.querySelector("thead");
const tbody = tableEl?.querySelector("tbody");

// Excel serial -> JS Date
function excelSerialToDate(n){
  if (typeof n !== "number" || !isFinite(n)) return null;
  const utcDays = Math.floor(n - 25569);
  const frac = n - Math.floor(n);
  const utcSeconds = utcDays * 86400 + Math.round(frac * 86400);
  const d = new Date(utcSeconds * 1000);
  return isNaN(d) ? null : d;
}
function headToText(h){
  if (h instanceof Date) return displayDateMMDDYYYY(h);
  if (typeof h === "number"){
    const d = excelSerialToDate(h);
    if (d) return displayDateMMDDYYYY(d);
  }
  return String(h ?? "");
}
function cellToText(v){
  if (v instanceof Date) return displayDateMMDDYYYY(v);
  if (typeof v === "number"){
    const d = excelSerialToDate(v);
    if (d) return displayDateMMDDYYYY(d);
    return String(v);
  }
  return String(v ?? "");
}

// State
let currentAOA = [];  // array-of-arrays for current sheet

function renderHeaderRow(headerRow){
  if (!thead) return;
  thead.innerHTML = `<tr>${headerRow.map(h=>`<th>${headToText(h)}</th>`).join("")}</tr>`;
}
function renderBodyRows(rows, limit){
  if (!tbody) return;
  const max = Math.max(0, Number(limit || 50));
  const slice = rows.slice(0, max);
  tbody.innerHTML = slice.map(r => `<tr>${r.map(c=>`<td>${cellToText(c)}</td>`).join("")}</tr>`).join("");
}
function applyFilterAndRender(){
  if (!currentAOA.length){ if (tbody) tbody.innerHTML = ""; return; }
  const header = currentAOA[0] || [];
  const body = currentAOA.slice(1);
  const q = (searchInput?.value || "").trim().toLowerCase();
  const filtered = !q ? body : body.filter(row => row.some(col => String(col ?? "").toLowerCase().includes(q)));
  renderHeaderRow(header);
  renderBodyRows(filtered, rowsSelect?.value || 50);
}

// List files
async function loadFiles(){
  if (!listEl) return;
  listEl.innerHTML = `<li class="muted">Loading…</li>`;
  try{
    const r = await apiFetch("/api/reports/files");
    const files = await r.json();

    if (!files?.length) { listEl.innerHTML = `<li class="muted">No reports yet</li>`; return; }

    listEl.innerHTML = files.map(f => `
      <li>
        <a href="${f.url}" class="file-link" data-name="${f.name || f.filename}">${f.name || f.filename}</a>
        <button class="btn preview-btn" data-url="${f.url}" data-name="${f.name || f.filename}" style="margin-left:8px">Preview</button>
        <span class="muted" style="margin-left:8px">${(Math.round((f.size||0)/102.4)/10).toFixed(1)} KB • ${displayDateMMDDYYYY(f.uploadedAt || f.createdAt || new Date())}</span>
      </li>
    `).join("");

    listEl.querySelectorAll(".preview-btn").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.preventDefault();
        const url = btn.getAttribute("data-url");
        const name = btn.getAttribute("data-name") || "Report";
        previewFile(url, name);
      });
    });
  }catch{
    listEl.innerHTML = `<li class="muted">Failed to load</li>`;
  }
}

// Upload
uploadBtn?.addEventListener("click", async ()=>{
  const f = uploadInput?.files?.[0];
  if (!f) { if (uploadStatus) uploadStatus.textContent = "Choose a file first"; return; }
  uploadStatus && (uploadStatus.textContent = "Uploading…");
  const fd = new FormData(); fd.append("file", f);

  try{
    const r = await apiFetch("/api/reports/upload", { method: "POST", body: fd });
    const j = await r.json().catch(()=>({}));
    if (r.ok) {
      uploadStatus.textContent = "Uploaded";
      uploadInput.value = "";
      await loadFiles();
    } else {
      uploadStatus.textContent = j.error || "Failed";
    }
  }catch{
    uploadStatus && (uploadStatus.textContent = "Failed");
  }
});

// Preview via XLSX
async function previewFile(url, displayName){
  try{
    if (!window.XLSX){
      previewWrap.style.display = "block";
      previewTitle.textContent = `Preview — ${displayName} (XLSX lib not loaded)`;
      thead.innerHTML = "";
      tbody.innerHTML = `<tr><td class="muted">xlsx.full.min.js not loaded</td></tr>`;
      return;
    }
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });

    // sheet chooser
    if (sheetSelect){
      sheetSelect.innerHTML = wb.SheetNames.map(n => `<option value="${n}">${n}</option>`).join("");
      sheetSelect.onchange = ()=>{
        const ws = wb.Sheets[sheetSelect.value];
        currentAOA = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        applyFilterAndRender();
      };
      sheetSelect.value = wb.SheetNames[0];
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    currentAOA = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

    previewWrap.style.display = "block";
    previewTitle.textContent = `Preview — ${displayName}`;
    applyFilterAndRender();
  }catch{
    previewWrap.style.display = "block";
    previewTitle.textContent = `Preview — ${displayName}`;
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td class="muted">Failed to preview file</td></tr>`;
  }
}

// Controls
searchInput?.addEventListener("input", applyFilterAndRender);
rowsSelect?.addEventListener("change", applyFilterAndRender);

// Init
await loadFiles();

