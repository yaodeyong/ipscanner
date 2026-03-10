const express = require("express");
const { getSystemInfo, clearLogs } = require("../controllers/system.controller");

const router = express.Router();

router.get("/info", getSystemInfo);
router.delete("/logs", clearLogs);

module.exports = router;
