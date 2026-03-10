const express = require("express");
const { listLogs } = require("../controllers/log.controller");

const router = express.Router();

router.get("/", listLogs);

module.exports = router;
