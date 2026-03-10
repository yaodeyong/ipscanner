const express = require("express");
const healthRoutes = require("./health.routes");
const ipRoutes = require("./ip.routes");
const checkRoutes = require("./check.routes");
const scanRoutes = require("./scan.routes");
const conflictRoutes = require("./conflict.routes");
const deviceRoutes = require("./device.routes");
const logRoutes = require("./log.routes");
const systemRoutes = require("./system.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/ips", ipRoutes);
router.use("/", checkRoutes);
router.use("/scan", scanRoutes);
router.use("/conflicts", conflictRoutes);
router.use("/devices", deviceRoutes);
router.use("/logs", logRoutes);
router.use("/system", systemRoutes);

module.exports = router;
