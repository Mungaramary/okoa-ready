import { getUser } from "./auth.js";
const me = getUser();

const badge = document.getElementById("roleBadge");
if (badge) badge.textContent = `${me.role === "team_leader" ? "Team Leader" : me.name || "Collector"}`;

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", ()=>{
  localStorage.removeItem("x-role");
  localStorage.removeItem("x-user-id");
  localStorage.removeItem("x-user-name");
  location.href = "index.html";
});

