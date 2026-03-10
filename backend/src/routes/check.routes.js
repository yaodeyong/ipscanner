const express = require("express");
const { checkIp } = require("../controllers/ip.controller");

const router = express.Router();

router.get("/check-ip", checkIp);

module.exports = router;
