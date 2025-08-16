// frontend/public/js/auth.js
// Keeps previous behavior; logout goes to index.html (falls back if missing)

export function getUser() {
  let u;
  try { u = JSON.parse(localStorage.getItem("okoa_user") || "{}"); } catch { u = {}; }
  if (!u || typeof u !== "object") u = {};

  if (u.role === "collector") {
    if (!u.id && typeof u.name === "string") {
      const m = u.name.match(/\d+/);
      if (m) u.id = `collector-${m[0]}`;
    }
    if (typeof u.id === "string" && /^collector\s*\d+$/i.test(u.id)) {
      const n = u.id.match(/\d+/)[0];
      u.id = `collector-${n}`;
    }
  }
  return u;
}
export function setUser(u) { localStorage.setItem("okoa_user", JSON.stringify(u || {})); }
export function clearUser() { localStorage.removeItem("okoa_user"); }

export async function apiFetch(url, opts = {}) {
  const u = getUser();
  const headers = new Headers(opts.headers || {});
  headers.set("Accept", "application/json");
  if (!(opts.body instanceof FormData)) {
    if (!headers.has("Content-Type") && opts.body && typeof opts.body === "object") {
      headers.set("Content-Type", "application/json");
    }
  }
  if (u?.token) headers.set("Authorization", `Bearer ${u.token}`);
  const init = { credentials: "same-origin", ...opts, headers };
  return fetch(url, init);
}

export function displayDateMMDDYYYY(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (!d || isNaN(d)) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// Logout: go to index.html; if missing, fallback (no 404)
export function attachLogout(selector = ".sidebar .btn, #logoutBtn, .logout-btn") {
  const candidates = [
    document.querySelector("#logoutBtn"),
    ...document.querySelectorAll(".logout, .logout-btn, .btn-logout, .sidebar .btn")
  ].filter(Boolean);

  const onClick = async (e) => {
    e?.preventDefault?.();
    try {
      clearUser();
      const resp = await fetch("/index.html", { method: "HEAD" });
      if (resp.ok) window.location.href = "/index.html";
      else window.location.href = "/dashboard.html";
    } catch {
      window.location.href = "/dashboard.html";
    }
  };

  for (const el of candidates) {
    if (!el._logoutBound) {
      el.addEventListener("click", onClick);
      el._logoutBound = true;
    }
  }
}

