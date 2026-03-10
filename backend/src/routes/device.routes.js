const express = require("express");
const { listDevices, getDeviceByMac } = require("../controllers/device.controller");

const router = express.Router();

router.get("/", listDevices);
router.get("/:mac", getDeviceByMac);

module.exports = router;
