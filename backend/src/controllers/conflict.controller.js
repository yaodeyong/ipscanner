const { sequelize } = require("../config/database");
const { writeLog } = require("./log.controller");
const { orderByIpv4NumericAsc } = require("../utils/ip-sql");

async function listConflicts(req, res, next) {
  try {
    const resolved = req.query.resolved;
    const whereParts = ["1=1"];
    const replacements = {};

    if (resolved === "0" || resolved === "false") {
      whereParts.push("c.resolved = 0");
    } else if (resolved === "1" || resolved === "true") {
      whereParts.push("c.resolved = 1");
    }

    if (req.query.ip) {
      whereParts.push("c.ip_address LIKE :ip");
      replacements.ip = `%${req.query.ip}%`;
    }

    const whereClause = `WHERE ${whereParts.join(" AND ")}`;

    const [rows] = await sequelize.query(
      `SELECT
          c.id,
          c.ip_address,
          c.mac_addresses,
          c.detected_at,
          c.last_detected,
          c.resolved,
          c.resolved_at,
          c.resolution_note
       FROM conflicts c
       ${whereClause}
       ORDER BY c.resolved ASC, ${orderByIpv4NumericAsc("c")}, c.last_detected DESC`,
      { replacements }
    );

    return res.json({
      code: 0,
      message: "ok",
      data: {
        items: rows,
        total: rows.length,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function resolveConflict(req, res, next) {
  try {
    const id = req.params.id;
    const { resolution_note = "", keep_mac = null } = req.body || {};

    const [rows] = await sequelize.query(
      `SELECT id, ip_address, mac_addresses FROM conflicts WHERE id = :id AND resolved = 0 LIMIT 1`,
      { replacements: { id } }
    );

    if (!rows.length) {
      return res.status(404).json({ code: 404, message: "未找到该冲突记录或已解决" });
    }

    const conflict = rows[0];

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `UPDATE conflicts
         SET resolved = 1, resolved_at = datetime('now','localtime'), resolution_note = :resolution_note
         WHERE id = :id`,
        { replacements: { id, resolution_note }, transaction }
      );

      if (keep_mac) {
        await sequelize.query(
          `UPDATE ip_assignments
           SET assigned_mac = :keep_mac, status = 'assigned', updated_at = datetime('now','localtime')
           WHERE ip_address = :ip`,
          { replacements: { keep_mac, ip: conflict.ip_address }, transaction }
        );
      } else {
        await sequelize.query(
          `UPDATE ip_assignments
           SET status = 'assigned', updated_at = datetime('now','localtime')
           WHERE ip_address = :ip AND status = 'conflict'`,
          { replacements: { ip: conflict.ip_address }, transaction }
        );
      }
    });

    await writeLog("system", "resolve_conflict", conflict.ip_address, `冲突ID=${id}, 保留MAC=${keep_mac || "当前"}, 备注=${resolution_note}`);

    return res.json({ code: 0, message: "冲突已解决", data: { id } });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listConflicts,
  resolveConflict,
};
