// frontend/public/js/payments.js
// Keeps your existing UI. Adds robust collectorId handling + date formatting.

import { apiFetch, getUser, displayDateMMDDYYYY, attachLogout } from "./auth.js";

attachLogout();

const me = getUser();
const tbody = document.querySelector("#paymentsTable tbody");
const uploadCard = document.getElementById("payUploadCard");   // hidden for collectors
const statusEl = document.getElementById("payUploadStatus");

// Hide Team Leader upload section for collectors (keeps your behavior)
if (me.role !== "team_leader" && uploadCard) uploadCard.style.display = "none";

// ---- Excel serial date -> JS Date ----
function excelDateToJS(serial) {
  if (typeof serial !== "number" || !isFinite(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const frac = serial - Math.floor(serial);
  const utcSeconds = utcDays * 86400 + Math.round(frac * 86400);
  const d = new Date(utcSeconds * 1000);
  return isNaN(d) ? null : d;
}
function prettyDate(v) {
  if (!v) return "";
  if (typeof v === "number") {
    const d = excelDateToJS(v);
    if (d) return displayDateMMDDYYYY(d);
  }
  const d = new Date(v);
  return isNaN(d) ? String(v) : displayDateMMDDYYYY(d);
}

// ---- Load table (same behavior; collectors filtered by their id) ----
async function load() {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td class="muted" colspan="6">Loading…</td></tr>`;

  const qs = new URLSearchParams();
  if (me.role === "collector" && me.id) qs.set("collectorId", me.id);

  try {
    const r = await apiFetch(`/api/payments?${qs.toString()}`);
    let rows = await r.json();

    // De-dup (collector|agent|date) to avoid duplicates on display
    const seen = new Map();
    const out = [];
    for (const p of rows || []) {
      const dateKey = new Date(p.date || p.createdAt || 0).toDateString();
      const key = `${p.collectorId || ""}|${p.agentNo || p.agent || ""}|${dateKey}`;
      if (!seen.has(key)) { seen.set(key, 1); out.push(p); }
    }
    rows = out;

    tbody.innerHTML = (rows || []).length ? rows.slice(0, 500).map(p => `
      <tr>
        <td>${p.collectorId || ""}</td>
        <td>${p.agentNo || p.agent || ""}</td>
        <td>${Number(p.loanAmount || 0).toLocaleString()}</td>
        <td>${Number(p.amountPaid || p.paid || 0).toLocaleString()}</td>
        <td>${Number(p.loanBalance || p.balance || 0).toLocaleString()}</td>
        <td>${prettyDate(p.date || p.createdAt)}</td>
      </tr>
    `).join("") : `<tr><td class="muted" colspan="6">No payments yet</td></tr>`;
  } catch {
    tbody.innerHTML = `<tr><td class="muted" colspan="6">Failed to load</td></tr>`;
  }
}

// ---- Upload handler (no UI change; normalizes collectorId) ----
document.getElementById("payUploadBtn")?.addEventListener("click", async () => {
  const fileInput = document.getElementById("payFile");
  const f = fileInput?.files?.[0];
  if (!f) { if (statusEl) statusEl.textContent = "Choose a file first"; return; }

  // Support your existing select id/name. We won't change your HTML:
  // Try commonly used ids, then any <select> as a last resort.
  const sel =
    document.getElementById("collectorSelect") ||
    document.getElementById("payCollector") ||
    document.querySelector("select");

  // Normalize to "collector-<n>" without altering your UI/labels.
  let cid =
    sel?.value ||
    sel?.selectedOptions?.[0]?.value ||
    sel?.selectedOptions?.[0]?.textContent || "";

  if (!/^collector-\d+$/i.test(String(cid))) {
    const n = String(cid).match(/\d+/);
    if (n) cid = `collector-${n[0]}`;
  }
  cid = String(cid || "").toLowerCase();

  if (statusEl) statusEl.textContent = "Uploading…";
  const fd = new FormData();
  fd.append("file", f);

  try {
    const url = `/api/payments/upload?${cid ? `collectorId=${encodeURIComponent(cid)}` : ""}`;
    const r = await apiFetch(url, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (statusEl) statusEl.textContent = r.ok ? `Uploaded (${j.inserted || j.count || 0} rows)` : (j.error || "Failed");
    await load();
  } catch {
    if (statusEl) statusEl.textContent = "Failed";
  }
});

// initial & periodic refresh (unchanged behavior)
await load();
setInterval(load, 20000);
