import { apiFetch, getUser, displayDateMMDDYYYY } from "./auth.js";

const me = getUser();
let aPage = 0, aLimit = 50, aTotal = 0, aSearch = "";

function $(s){ return document.querySelector(s); }

// Hide TL upload for collectors
if (me.role !== "team_leader") {
  const c = $("#uploadCard");
  if (c) c.style.display = "none";
}

// --- TL collector selector ---
async function populateCollectorSelect(){
  const sel = $("#collectorSelect"); if (!sel) return;
  if (me.role !== "team_leader"){ sel.style.display="none"; return; }
  let list = [];
  try { const r = await apiFetch("/api/users/collectors"); list = await r.json(); } catch {}
  if (!Array.isArray(list)) list = [];
  sel.innerHTML = list.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");
}
function selCollectorId(){ const s=$("#collectorSelect"); return s ? s.value : ""; }

// --- Upload accounts (TL) ---
$("#uploadBtn")?.addEventListener("click", async ()=>{
  const status = $("#uploadStatus");
  const file = $("#fileInput")?.files?.[0];
  if (!file){ status.textContent="Choose a file first"; return; }

  const fd = new FormData();
  fd.append("file", file);
  const cid = selCollectorId();
  if (cid) fd.append("collectorId", cid);

  status.textContent = "Uploading…";
  try{
    const r = await apiFetch("/api/accounts/upload",{ method:"POST", body:fd });
    let j = {}; try{ j = await r.json(); }catch{}
    status.textContent = r.ok ? (j.message || "Uploaded") : (j.error || "Upload failed");
    await Promise.all([loadFilesList(), loadAccountsTable()]);
  }catch{
    status.textContent = "Upload failed";
  }
});

$("#refreshBtn")?.addEventListener("click", ()=>{
  loadFilesList(); loadAccountsTable();
});

// --- Available files list ---
function normalizeFilesPayload(data){
  if (Array.isArray(data)) return data;
  if (data?.files) return data.files;
  if (data?.rows)  return data.rows;
  return [];
}
function pickUrl(f){ return f.url || f.path || (f.filename?`/uploads/accounts/${f.filename}`:"#"); }
function pickName(f){ return f.name || f.originalName || f.filename || "file"; }

async function loadFilesList(){
  const wrap = $("#filesList");
  wrap.innerHTML = `<li class="muted">Loading…</li>`;
  const qs = new URLSearchParams();
  const cid = selCollectorId();
  if (me.role==="team_leader" && cid) qs.set("collectorId", cid);

  try{
    const r = await apiFetch(`/api/accounts/files?${qs.toString()}`);
    const j = await r.json();
    const files = normalizeFilesPayload(j);
    wrap.innerHTML = files.length ? files.map(f=>`
      <li>
        <span class="file-actions">
          <a href="${pickUrl(f)}" download>${pickName(f)}</a>
          <button class="btn small previewBtn" data-url="${pickUrl(f)}" data-name="${pickName(f)}">Preview</button>
        </span>
        <span class="muted">
          ${f.size?((f.size/1024).toFixed(1)+" KB • "):""}
          ${displayDateMMDDYYYY(f.uploadedAt||f.createdAt)}
        </span>
      </li>
    `).join("") : `<li class="muted">No files yet</li>`;
  }catch{
    wrap.innerHTML = `<li class="muted">Failed to load files</li>`;
  }
}

// --- Inline preview (SheetJS) ---
let pWb=null,pHeader=[],pRows=[],pIdx=[],pPage=0,pLimit=50,pSortCol=-1,pSortDir=1,pName="";
function detectExt(n=""){ const m=n.toLowerCase().match(/\.(xlsx|xls|csv)$/); return m?m[1]:""; }

async function previewFile(url,name){
  $("#previewCard").style.display="block";
  $("#previewTitle").textContent = `Preview — ${name}`;
  pName = name;
  pPage = 0; pLimit = parseInt($("#previewPageSize")?.value||"50",10)||50;

  const ext=detectExt(name||url);
  try{
    let wb;
    if(ext==="csv"){ const t=await fetch(url).then(r=>r.text()); wb=XLSX.read(t,{type:"string"}); }
    else { const b=await fetch(url).then(r=>r.arrayBuffer()); wb=XLSX.read(new Uint8Array(b),{type:"array"}); }
    pWb=wb;
    const sel=$("#previewSheet");
    sel.innerHTML=wb.SheetNames.map((n,i)=>`<option value="${i}">${n}</option>`).join("");
    sel.value="0";
    loadPreview(0);
    $("#previewCsvBtn").disabled = false;
  }catch{
    $("#previewThead").innerHTML="";
    $("#previewTbody").innerHTML=`<tr><td class="muted">Failed to load preview</td></tr>`;
    $("#previewCsvBtn").disabled = true;
  }
}

function loadPreview(i){
  const sheet=pWb.Sheets[pWb.SheetNames[i]];
  const aoa=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true});
  pHeader=(aoa[0]||[]).map(h=>String(h||"").trim());
  pRows=aoa.slice(1);
  pIdx=pRows.map((_,i)=>i);
  pSortCol=-1; pSortDir=1; pPage=0;
  renderPreview();
}

function renderPreview(){
  $("#previewThead").innerHTML=`<tr>${pHeader.map((h,i)=>`<th class="sortable" data-col="${i}">${h}${pSortCol===i?(pSortDir>0?" ▲":" ▼"):""}</th>`).join("")}</tr>`;
  const start=pPage*pLimit, end=Math.min(pIdx.length,start+pLimit), idx=pIdx.slice(start,end);
  $("#previewTbody").innerHTML = idx.length ? idx.map(i=>{
    const row=pRows[i]||[];
    return `<tr>${pHeader.map((_,c)=>`<td>${formatCell(row[c])}</td>`).join("")}</tr>`;
  }).join("") : `<tr><td class="muted">No rows</td></tr>`;
  const pages=Math.max(1,Math.ceil(pIdx.length/pLimit));
  $("#previewPageInfo").textContent=`Showing ${pIdx.length?(start+1):0}-${end} of ${pIdx.length} (Page ${pPage+1}/${pages})`;
  $("#previewPrev").disabled=pPage<=0; $("#previewNext").disabled=pPage>=pages-1;
}

function formatCell(v){
  if(v==null) return "";
  if (v instanceof Date) return displayDateMMDDYYYY(v);
  return String(v);
}

$("#filesList")?.addEventListener("click",(e)=>{
  const b=e.target.closest?.(".previewBtn");
  if(!b) return;
  previewFile(b.getAttribute("data-url"), b.getAttribute("data-name"));
});
$("#previewPrev")?.addEventListener("click",()=>{ if(pPage>0){ pPage--; renderPreview(); }});
$("#previewNext")?.addEventListener("click",()=>{ pPage++; renderPreview(); });
$("#previewPageSize")?.addEventListener("change",(e)=>{ pLimit=parseInt(e.target.value,10)||50; pPage=0; renderPreview(); });
$("#previewSheet")?.addEventListener("change",(e)=>{ loadPreview(parseInt(e.target.value,10)||0); });

let pSearchTimer=null;
$("#previewSearch")?.addEventListener("input",(e)=>{
  const q=(e.target.value||"").trim().toLowerCase();
  clearTimeout(pSearchTimer);
  pSearchTimer=setTimeout(()=>{
    pIdx = !q
      ? pRows.map((_,i)=>i)
      : pRows.reduce((a,row,i)=> (row && row.some(c=>String(c??'').toLowerCase().includes(q)) && a.push(i), a), []);
    pPage=0; renderPreview();
  },250);
});

function cmp(a,b){
  const na=Number(a), nb=Number(b);
  const an=!isNaN(na), bn=!isNaN(nb);
  if(an&&bn) return na-nb;
  return String(a||"").localeCompare(String(b||""),undefined,{numeric:true,sensitivity:"base"});
}
$("#previewThead")?.addEventListener("click",(e)=>{
  const th=e.target.closest?.("th.sortable"); if(!th) return;
  const col=parseInt(th.getAttribute("data-col"),10);
  if(pSortCol===col) pSortDir*=-1; else { pSortCol=col; pSortDir=1; }
  pIdx.sort((i,j)=> pSortDir * cmp(pRows[i]?.[col], pRows[j]?.[col]));
  pPage=0; renderPreview();
});

function toCsv(rows){
  return rows.map(r => r.map(v => {
    if (v == null) return "";
    const s = String(v).replace(/"/g,'""');
    if (/[",\n]/.test(s)) return `"${s}"`;
    return s;
  }).join(",")).join("\n");
}
function downloadCsv(name, csv){
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}
$("#previewCsvBtn")?.addEventListener("click", ()=>{
  if (!pHeader.length) return;
  const filtered = pIdx.map(i => pRows[i] || []);
  const csv = toCsv([pHeader, ...filtered]);
  const base = (pName || "accounts").replace(/\.[^.]+$/, "");
  downloadCsv(`${base}_filtered.csv`, csv);
});

// ===== Dynamic DB table (ALL columns) =====
function renderAccHeader(columns){
  const thead = document.getElementById("accThead");
  if (!thead) return;
  thead.innerHTML = `<tr>${columns.map(c => `<th>${c}</th>`).join("")}</tr>`;
}

// Identify “date-like” columns by name
function isDateKey(key){
  return /(^|_)(date|created|updated|calc|dob)(_|$)/i.test(key) || /at$/i.test(key);
}

// Safer formatter: only treat values as dates if the *column* is a date column
function prettyCell(key, v){
  if (v == null) return "";

  // Date object
  if (v instanceof Date) return displayDateMMDDYYYY(v);

  // String value
  if (typeof v === "string") {
    const s = v.trim();

    // Only parse as date when the column name suggests it
    if (isDateKey(key) && (/\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(s))) {
      const d = new Date(s);
      if (!isNaN(d)) return displayDateMMDDYYYY(d);
    }

    // Numeric-like → pretty number, but keep leading-zero IDs (e.g., MSISDN) as-is
    if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d+$/.test(s)) return Number(s).toLocaleString();

    return s;
  }

  // Number → format as number
  if (typeof v === "number") return v.toLocaleString();

  return String(v);
}

function renderAccRows(columns, rows){
  const tbody = document.getElementById("accTbody");
  if (!tbody) return;
  if (!rows.length){ tbody.innerHTML = `<tr><td class="muted">No data</td></tr>`; return; }
  tbody.innerHTML = rows.map(r =>
    `<tr>${columns.map(c => `<td>${prettyCell(c, r[c])}</td>`).join("")}</tr>`
  ).join("");
}

async function loadAccountsTable(){
  const tb = document.getElementById("accTbody");
  if (tb) tb.innerHTML = `<tr><td class="muted">Loading…</td></tr>`;

  const qs = new URLSearchParams({ page:String(aPage), limit:String(aLimit) });
  const cid = selCollectorId();
  if (me.role === "team_leader" && cid) qs.set("collectorId", cid);
  if (aSearch) qs.set("search", aSearch);
  if (me.role === "collector") qs.set("collectorId", me.id);

  try{
    const r = await apiFetch(`/api/accounts/rows?${qs.toString()}`);
    const j = await r.json();
    const rows = j.rows || j.data || [];
    const columns = j.columns || Object.keys(rows[0] || {});

    renderAccHeader(columns);
    renderAccRows(columns, rows);

    aTotal = j.total || rows.length;
    updatePager();
  }catch{
    if (tb) tb.innerHTML = `<tr><td class="muted">Failed to load</td></tr>`;
  }
}

function updatePager(){
  const info=$("#accPageInfo"), prev=$("#accPrev"), next=$("#accNext");
  const pages=Math.max(1,Math.ceil(aTotal/aLimit));
  const start=aPage*aLimit+1, end=Math.min(aTotal,(aPage+1)*aLimit);
  if(info) info.textContent=`Showing ${aTotal?start:0}-${end} of ${aTotal} (Page ${aPage+1}/${pages})`;
  if(prev) prev.disabled=aPage<=0;
  if(next) next.disabled=aPage>=pages-1;
}

$("#accPrev")?.addEventListener("click",()=>{ if(aPage>0){ aPage--; loadAccountsTable(); }});
$("#accNext")?.addEventListener("click",()=>{ aPage++; loadAccountsTable(); });
$("#accPageSize")?.addEventListener("change",(e)=>{ aLimit=parseInt(e.target.value,10)||50; aPage=0; loadAccountsTable(); });

let searchTimer=null;
$("#accSearch")?.addEventListener("input",(e)=>{
  const v=(e.target.value||"").trim();
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{ aSearch=v; aPage=0; loadAccountsTable(); },300);
});

$("#collectorSelect")?.addEventListener("change",()=>{
  aPage=0; loadFilesList(); loadAccountsTable();
});

// ---- boot ----
await populateCollectorSelect();
await Promise.all([loadFilesList(), loadAccountsTable()]);
setInterval(()=>{ loadFilesList(); loadAccountsTable(); }, 20000);

