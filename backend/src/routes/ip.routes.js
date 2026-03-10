const express = require("express");
const { listIps, getIpDetail, createIp, updateIp, deleteIp, exportExcel } = require("../controllers/ip.controller");

const router = express.Router();

router.get("/", listIps);
router.get("/export", exportExcel);
router.get("/:ip", getIpDetail);
router.post("/", createIp);
router.put("/:ip", updateIp);
router.delete("/:ip", deleteIp);

module.exports = router;
