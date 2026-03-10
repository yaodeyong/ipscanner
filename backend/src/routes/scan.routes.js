const express = require("express");
const { triggerScan } = require("../controllers/scan.controller");

const router = express.Router();

router.post("/", triggerScan);

module.exports = router;
