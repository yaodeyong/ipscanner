const { sequelize } = require("../config/database");
const path = require("path");
const fs = require("fs");
const env = require("../config/env");

async function getSystemInfo(req, res, next) {
  try {
    const [[ipCount]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM ip_assignments`);
    const [[deviceCount]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM devices`);
    const [[conflictCount]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM conflicts WHERE resolved = 0`);
    const [[logCount]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM audit_log`);
    const [[ouiCount]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM oui`);

    const dbPath = env.db.storage || path.resolve(__dirname, "..", "..", "data", "ipscanner.db");
    let dbSizeBytes = 0;
    try {
      const stat = fs.statSync(dbPath);
      dbSizeBytes = stat.size;
    } catch (e) {
      // file may not exist yet
    }

    return res.json({
      code: 0,
      message: "ok",
      data: {
        dbPath,
        dbSizeMB: (dbSizeBytes / 1024 / 1024).toFixed(2),
        counts: {
          ip_assignments: Number(ipCount.cnt),
          devices: Number(deviceCount.cnt),
          unresolved_conflicts: Number(conflictCount.cnt),
          audit_logs: Number(logCount.cnt),
          oui_vendors: Number(ouiCount.cnt),
        },
        nodeVersion: process.version,
        platform: process.platform,
        uptime: Math.floor(process.uptime()),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function clearLogs(req, res, next) {
  try {
    await sequelize.query(`DELETE FROM audit_log`);
    return res.json({ code: 0, message: "日志已清空" });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSystemInfo,
  clearLogs,
};
