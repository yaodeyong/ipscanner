const { sequelize } = require("../config/database");

async function listDevices(req, res, next) {
  try {
    const replacements = {};
    const whereParts = ["1=1"];

    if (req.query.mac) {
      whereParts.push("d.mac LIKE :mac");
      replacements.mac = `%${req.query.mac}%`;
    }
    if (req.query.vendor) {
      whereParts.push("d.vendor LIKE :vendor");
      replacements.vendor = `%${req.query.vendor}%`;
    }
    if (req.query.hostname) {
      whereParts.push("d.hostname LIKE :hostname");
      replacements.hostname = `%${req.query.hostname}%`;
    }

    const whereClause = `WHERE ${whereParts.join(" AND ")}`;

    const [rows] = await sequelize.query(
      `SELECT d.mac, d.vendor, d.hostname, d.first_seen, d.last_seen,
              ipa.ip_address, ipa.status, ipa.department, ipa.owner_user
       FROM devices d
       LEFT JOIN ip_assignments ipa ON ipa.assigned_mac = d.mac
       ${whereClause}
       ORDER BY d.last_seen DESC`,
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

async function getDeviceByMac(req, res, next) {
  try {
    const mac = req.params.mac;
    const [rows] = await sequelize.query(
      `SELECT d.mac, d.vendor, d.hostname, d.first_seen, d.last_seen
       FROM devices d
       WHERE d.mac = :mac
       LIMIT 1`,
      { replacements: { mac } }
    );

    if (!rows.length) {
      return res.status(404).json({ code: 404, message: "设备未找到" });
    }

    const [ipRows] = await sequelize.query(
      `SELECT ip_address, status, last_online FROM ip_assignments WHERE assigned_mac = :mac`,
      { replacements: { mac } }
    );

    return res.json({
      code: 0,
      message: "ok",
      data: {
        ...rows[0],
        ip_records: ipRows,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listDevices,
  getDeviceByMac,
};
