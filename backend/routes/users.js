
const express = require("express");
const router = express.Router();
const { requireAny } = require("../middleware/roleGuard");
router.get("/collectors", requireAny, async (req, res) => {
  res.json([
    { id: "collector1", name: "Collector 1" },
    { id: "collector2", name: "Collector 2" },
    { id: "collector3", name: "Collector 3" },
  ]);
});
module.exports = router;
