// frontend/public/js/tasks.js
import { apiFetch, getUser, displayDateMMDDYYYY, attachLogout } from "./auth.js";
attachLogout();

const me = getUser(); // { role, name, collectorId, ... }

const titleEl = document.querySelector('#taskTitle') || document.querySelector('input[placeholder="Task title"]') || document.querySelector('input[type="text"]');
const whoEl   = document.querySelector('#taskAssignee') || document.querySelector('select');
const dueEl   = document.querySelector('#taskDue') || document.querySelector('input[type="date"]');
const descEl  = document.querySelector('#taskDesc') || document.querySelector('textarea');
const addBtn  = document.querySelector('#addTaskBtn') || Array.from(document.querySelectorAll("button")).find(b => /add task/i.test(b.textContent));

// List container — try table body first, else last card
const tableBody = document.querySelector("#tasksTableBody") || document.querySelector("table tbody");
const listContainer = tableBody ? tableBody : (document.querySelectorAll(".card")[document.querySelectorAll(".card").length - 1] || document.body);

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
  if ((me?.role || "").toLowerCase() === "team_leader") {
    whoEl.innerHTML = `
      <option value="collector-1">Collector 1</option>
      <option value="collector-2">Collector 2</option>
      <option value="collector-3">Collector 3</option>
    `;
  } else {
    // Collector
    const mine = me?.collectorId || "collector-1";
    whoEl.innerHTML = `<option value="${mine}">Me</option>`;
    whoEl.disabled = true;
  }
})();

async function createTask(){
  const title = titleEl?.value?.trim();
  const description = descEl?.value?.trim() || "";
  let assignedTo = normalizeCollectorId(whoEl?.value || me?.collectorId || "");
  if (!title) return alert("Enter a task title");
  if (!assignedTo) {
    if (me?.collectorId) assignedTo = me.collectorId;
    else return alert("No assignee found");
  }
  const body = {
    title,
    description,
    assignedTo,
    dueDate: dueEl?.value || null,
    createdBy: me?.name || me?.email || "unknown",
    createdByName: me?.name || null,
  };
  const r = await apiFetch("/api/tasks", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) return alert(j.error || "Failed to create task");
  if (titleEl) titleEl.value = "";
  if (descEl)  descEl.value = "";
  if (dueEl)   dueEl.value = "";
  await loadTasks();
}

async function setStatus(id, status){
  const r = await apiFetch(`/api/tasks/${id}/status`, { method: "PATCH", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ status }) });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) return alert(j.error || "Failed to update task");
  await loadTasks();
}

async function attachFile(id, file){
  const fd = new FormData();
  fd.append("file", file);
  const r = await apiFetch(`/api/tasks/${id}/attach`, { method: "POST", body: fd });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) return alert(j.error || "Failed to upload attachment");
  await loadTasks();
}

function ensureTable() {
  if (tableBody) return tableBody;
  // Build a simple table inside the container
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.innerHTML = `
    <table class="table" style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th>Task</th><th>Assigned To</th><th>Status</th><th>Due</th><th>Attachments</th><th>Action</th>
        </tr>
      </thead>
      <tbody id="tasksTableBody"></tbody>
    </table>
  `;
  listContainer.innerHTML = "";
  listContainer.appendChild(wrap);
  return wrap.querySelector("#tasksTableBody");
}

function renderTasks(tasks){
  const body = ensureTable();
  if (!tasks || !tasks.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">No tasks yet</td></tr>`;
    return;
  }
  body.innerHTML = tasks.map(t=>{
    const due = t.dueDate ? displayDateMMDDYYYY(new Date(t.dueDate)) : "-";
    const atts = (t.attachments || []).map(a => `<a href="${a.path}" target="_blank">${a.name}</a>`).join(", ");
    const actions = `
      ${t.status !== "Done"
        ? `<button class="btn small mark-done" data-id="${t._id}">Done</button>`
        : `<button class="btn small mark-open" data-id="${t._id}">Reopen</button>`}
      <label class="btn small" style="margin-left:6px;cursor:pointer;">
        Attach<input type="file" data-id="${t._id}" style="display:none">
      </label>
    `;
    return `
      <tr>
        <td>${t.title}<div class="muted">${t.description || ""}</div></td>
        <td>${t.assignedTo}</td>
        <td>${t.status}</td>
        <td>${due}</td>
        <td>${atts || "-"}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join("");

  document.querySelectorAll(".mark-done").forEach(b=>{
    b.addEventListener("click", ()=> setStatus(b.dataset.id, "Done"));
  });
  document.querySelectorAll(".mark-open").forEach(b=>{
    b.addEventListener("click", ()=> setStatus(b.dataset.id, "Open"));
  });
  document.querySelectorAll('input[type="file"][data-id]').forEach(inp=>{
    inp.addEventListener("change", ()=> {
      if (inp.files && inp.files[0]) attachFile(inp.dataset.id, inp.files[0]);
    });
  });
}

async function loadTasks(){
  const role = (me?.role || "").toLowerCase();
  const params = new URLSearchParams();
  params.set("role", role);
  if (role === "collector" && me?.collectorId) params.set("collectorId", me.collectorId);
  if (role === "team_leader" && me?.name)       params.set("me", me.name);

  const r = await apiFetch(`/api/tasks?${params.toString()}`);
  const j = await r.json().catch(()=>({ error: "x" }));
  if (!r.ok || j.error) {
    const body = ensureTable();
    body.innerHTML = `<tr><td colspan="6" class="muted">Failed to load tasks</td></tr>`;
    return;
  }
  renderTasks(Array.isArray(j) ? j : []);
}

if (addBtn && !addBtn._bound) { addBtn._bound = true; addBtn.addEventListener("click", (e)=>{ e.preventDefault(); createTask(); }); }

loadTasks();
