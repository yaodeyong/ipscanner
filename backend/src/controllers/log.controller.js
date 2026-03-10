const { sequelize } = require("../config/database");

async function writeLog(user, action, ip_address, details) {
  try {
    await sequelize.query(
      `INSERT INTO audit_log (user, action, ip_address, details)
       VALUES (:user, :action, :ip_address, :details)`,
      { replacements: { user: user || "system", action, ip_address: ip_address || null, details: details || null } }
    );
  } catch (error) {
    console.error("[audit_log] write failed:", error.message);
  }
}

async function listLogs(req, res, next) {
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const pageSize = Math.max(1, Math.min(200, Math.floor(Number(req.query.pageSize)) || 50));
    const offset = (page - 1) * pageSize;
    const replacements = {};
    const whereParts = ["1=1"];

    if (req.query.action) {
      whereParts.push("action = :action");
      replacements.action = req.query.action;
    }
    if (req.query.ip) {
      whereParts.push("ip_address LIKE :ip");
      replacements.ip = `%${req.query.ip}%`;
    }
    if (req.query.user) {
      whereParts.push("user LIKE :user");
      replacements.user = `%${req.query.user}%`;
    }

    const whereClause = `WHERE ${whereParts.join(" AND ")}`;

    const [countRows] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM audit_log ${whereClause}`,
      { replacements }
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await sequelize.query(
      `SELECT id, user, action, ip_address, details, created_at
       FROM audit_log
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      { replacements }
    );

    return res.json({
      code: 0,
      message: "ok",
      data: {
        items: rows,
        total,
        pagination: { page, pageSize, total },
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listLogs,
  writeLog,
};
