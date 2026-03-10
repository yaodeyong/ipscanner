const express = require("express");
const { listConflicts, resolveConflict } = require("../controllers/conflict.controller");

const router = express.Router();

router.get("/", listConflicts);
router.put("/:id/resolve", resolveConflict);

module.exports = router;
