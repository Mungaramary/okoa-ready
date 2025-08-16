
import { apiFetch, getUser, displayDateMMDDYYYY, attachLogout } from "./auth.js";
const me = getUser(); attachLogout();
function $(s){ return document.querySelector(s); }
async function initAddTaskUI(){
  const assSel=$("#taskAssignee");
  if (me.role === "team_leader") {
    try{ const r=await apiFetch("/api/users/collectors"); const list=await r.json(); assSel.innerHTML=(list||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join(""); }
    catch{ assSel.innerHTML=`<option value="collector1">Collector 1</option><option value="collector2">Collector 2</option><option value="collector3">Collector 3</option>`; }
  } else {
    assSel.innerHTML = `<option value="${me.id}">Me</option>`; assSel.disabled = true;
  }
  $("#addTaskBtn").addEventListener("click", async ()=>{
    const title=$("#taskTitle").value.trim(); const assignedTo=$("#taskAssignee").value; const dueDate=$("#taskDue").value; const description=$("#taskDesc").value.trim(); const statusEl=$("#taskFormStatus");
    if(!title){ statusEl.textContent="Title required"; return; } if(!assignedTo){ statusEl.textContent="Assignee required"; return; }
    statusEl.textContent="Saving…";
    const r=await apiFetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ title, assignedTo, dueDate, description })});
    const j=await r.json().catch(()=>({})); statusEl.textContent=r.ok?"Task added":(j.error||"Failed");
    if(r.ok){ $("#taskTitle").value=""; $("#taskDesc").value=""; $("#taskDue").value=""; } await loadTasks();
  });
}
function normalizeTask(t){ return { title:t.title||t.name||"Untitled", assignee:t.assigneeName||t.assignedToName||t.collectorName||"", status:t.status||"open", due:t.dueDate||t.due||null, _id:t._id }; }
async function loadTasks(){
  const tb=$("#tasksTable tbody"); tb.innerHTML=`<tr><td colspan="5" class="muted">Loading…</td></tr>`;
  try{ const r=await apiFetch(`/api/tasks`); const data=await r.json(); const tasks=Array.isArray(data)?data:(data.tasks||[]);
    tb.innerHTML = tasks.length ? tasks.map(t=>{ const n=normalizeTask(t); const canEdit=me.role==="team_leader"; const canComplete=me.role==="team_leader"||n.status!=="done"; return `<tr data-id="${t._id}">
      <td class="task-title">${n.title}</td>
      <td>${n.assignee||"-"}</td>
      <td>${canEdit?`<select class="task-status input"><option value="open" ${n.status==="open"?"selected":""}>open</option><option value="in_progress" ${n.status==="in_progress"?"selected":""}>in_progress</option><option value="done" ${n.status==="done"?"selected":""}>done</option></select>`:n.status}</td>
      <td>${displayDateMMDDYYYY(n.due)}</td>
      <td>${canComplete?`<button class="btn btn-mark-done">Mark done</button>`:""} ${canEdit?`<button class="btn btn-save-status">Save</button>`:""}</td>
    </tr>`; }).join("") : `<tr><td colspan="5" class="muted">No tasks yet</td></tr>`;
  }catch{ tb.innerHTML=`<tr><td colspan="5" class="muted">Failed to load tasks</td></tr>`; }
}
async function saveRowStatus(tr, newStatus){ const id=tr.getAttribute("data-id"); const r=await apiFetch(`/api/tasks/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ status:newStatus })}); const j=await r.json().catch(()=>({})); if(!r.ok) alert(j.error||"Failed to update"); }
document.addEventListener("click", async (e)=>{ const tr=e.target?.closest?.("tr[data-id]"); if(!tr) return; if(e.target.classList.contains("btn-mark-done")){ await saveRowStatus(tr,"done"); await loadTasks(); } if(e.target.classList.contains("btn-save-status")){ const sel=tr.querySelector(".task-status"); if(!sel) return; await saveRowStatus(tr, sel.value); await loadTasks(); } });
await initAddTaskUI(); await loadTasks(); setInterval(loadTasks, 20000);
