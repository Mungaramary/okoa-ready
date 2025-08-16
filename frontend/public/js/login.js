
import { setUser } from "./auth.js";
const form = document.getElementById("loginForm");
const btn = document.getElementById("loginBtn");
const statusEl = document.getElementById("loginStatus");
const roleEl = document.getElementById("role");
function makeUser(choice){
  switch (choice) {
    case "team_leader": return { id: "teamlead", name: "Team Leader", role: "team_leader" };
    case "collector1": return { id: "collector1", name: "Collector 1", role: "collector" };
    case "collector2": return { id: "collector2", name: "Collector 2", role: "collector" };
    case "collector3": return { id: "collector3", name: "Collector 3", role: "collector" };
    default: return { id: "guest", name: "Guest", role: "collector" };
  }
}
function setBusy(b){ btn.disabled=b; roleEl.disabled=b; statusEl.textContent=b?"Signing in…":""; }
form.addEventListener("submit",(e)=>{
  e.preventDefault(); setBusy(true);
  try{ const user=makeUser(roleEl.value); localStorage.removeItem("okoa_token"); setUser(user); window.location.href="dashboard.html"; }
  catch{ statusEl.textContent="Failed to sign in"; } finally { setBusy(false); }
});
roleEl.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event("submit")); } });
