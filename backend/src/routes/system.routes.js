const express = require("express");
const {
  getSystemInfo,
  clearLogs,
  getNetworkDiagnostics,
  listNetworkDiagReports,
  getNetworkDiagReportDetail,
  buildNetworkConclusionReport,
} = require("../controllers/system.controller");

const router = express.Router();

router.get("/info", getSystemInfo);
router.get("/network-diag", getNetworkDiagnostics);
router.get("/network-diag/reports", listNetworkDiagReports);
router.get("/network-diag/reports/:id", getNetworkDiagReportDetail);
router.get("/network-diag/conclusion", buildNetworkConclusionReport);
router.delete("/logs", clearLogs);

module.exports = router;
