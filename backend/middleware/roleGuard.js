
function parseUserHeader(req){
  const raw = req.headers["x-okoa-user"];
  if (!raw) return { id: "guest", role: "collector", name: "Guest" };
  try { const u = JSON.parse(raw); return { id: u.id||"guest", role: u.role||"collector", name: u.name||"Guest" }; }
  catch { return { id: "guest", role: "collector", name: "Guest" }; }
}
function requireAny(req, res, next){
  req.user = parseUserHeader(req);
  return next();
}
module.exports = { requireAny };
