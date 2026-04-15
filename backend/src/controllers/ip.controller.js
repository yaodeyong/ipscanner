const { sequelize } = require("../config/database");
const { writeLog } = require("./log.controller");
const { orderByIpv4NumericAsc } = require("../utils/ip-sql");

function normalizePage(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

async function listIps(req, res, next) {
  try {
    const page = normalizePage(req.query.page, 1);
    const pageSize = normalizePage(req.query.pageSize, 50);
    const offset = (page - 1) * pageSize;
    const replacements = {};
    const whereParts = ["1=1"];

    if (req.query.status) {
      whereParts.push("ipa.status = :status");
      replacements.status = req.query.status;
    }
    if (req.query.mac) {
      whereParts.push("ipa.assigned_mac LIKE :mac");
      replacements.mac = `%${req.query.mac}%`;
    }
    if (req.query.ip) {
      whereParts.push("ipa.ip_address LIKE :ip");
      replacements.ip = `%${req.query.ip}%`;
    }

    const whereClause = `WHERE ${whereParts.join(" AND ")}`;
    const [countRows] = await sequelize.query(
      `SELECT COUNT(*) AS total FROM ip_assignments ipa ${whereClause}`,
      { replacements }
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await sequelize.query(
      `SELECT
          ipa.id,
          ipa.ip_address,
          ipa.status,
          CASE
            WHEN ipa.status = 'conflict' THEN 'conflict'
            WHEN ipa.online_flag = 1 THEN 'online'
            ELSE 'offline'
          END AS display_status,
          ipa.assigned_mac,
          ipa.department,
          ipa.owner_user,
          ipa.note,
          ipa.last_online,
          d.hostname,
          d.vendor,
          c.mac_addresses AS conflict_macs
       FROM ip_assignments ipa
       LEFT JOIN devices d ON d.mac = ipa.assigned_mac
       LEFT JOIN (
         SELECT c1.ip_address, c1.mac_addresses
         FROM conflicts c1
         INNER JOIN (
           SELECT ip_address, MAX(id) AS max_id
           FROM conflicts
           WHERE resolved = 0
           GROUP BY ip_address
         ) c2 ON c1.id = c2.max_id
       ) c ON c.ip_address = ipa.ip_address
       ${whereClause}
       ORDER BY ${orderByIpv4NumericAsc("ipa")}
       LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`,
      { replacements }
    );

    const [[summary]] = await sequelize.query(
      `SELECT
          COUNT(*) AS totalDevices,
          SUM(CASE WHEN status <> 'conflict' AND online_flag = 1 THEN 1 ELSE 0 END) AS onlineDevices,
          SUM(CASE WHEN status = 'conflict' OR online_flag = 0 THEN 1 ELSE 0 END) AS offlineDevices,
          SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflictDevices
       FROM ip_assignments`
    );

    return res.json({
      code: 0,
      message: "ok",
      data: {
        items: rows,
        summary: {
          totalDevices: Number(summary?.totalDevices || 0),
          onlineDevices: Number(summary?.onlineDevices || 0),
          offlineDevices: Number(summary?.offlineDevices || 0),
          conflictDevices: Number(summary?.conflictDevices || 0),
        },
        pagination: {
          page,
          pageSize,
          total,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getIpDetail(req, res, next) {
  try {
    const [rows] = await sequelize.query(
      `SELECT id, ip_address, status, assigned_mac, assigned_date, department, owner_user, note, last_online
       FROM ip_assignments
       WHERE ip_address = :ip
       LIMIT 1`,
      { replacements: { ip: req.params.ip } }
    );
    if (!rows.length) {
      return res.status(404).json({ code: 404, message: "IP not found" });
    }
    return res.json({ code: 0, message: "ok", data: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function createIp(req, res, next) {
  try {
    const { ip_address, assigned_mac = null, note = null, status = "assigned", department = null, owner_user = null } = req.body || {};
    if (!ip_address) {
      return res.status(400).json({ code: 400, message: "ip_address is required" });
    }

    await sequelize.query(
      `INSERT INTO ip_assignments (ip_address, status, assigned_mac, assigned_date, department, owner_user, note, last_online)
       VALUES (:ip_address, :status, :assigned_mac, datetime('now','localtime'), :department, :owner_user, :note, NULL)`,
      { replacements: { ip_address, status, assigned_mac, department, owner_user, note } }
    );
    await writeLog("user", "create", ip_address, `新增IP分配 MAC=${assigned_mac || "无"}`);
    return res.status(201).json({ code: 0, message: "ip assignment created" });
  } catch (error) {
    return next(error);
  }
}

async function updateIp(req, res, next) {
  try {
    const { assigned_mac = null, note = null, status = null, department = null, owner_user = null } = req.body || {};
    await sequelize.query(
      `UPDATE ip_assignments
       SET assigned_mac = :assigned_mac,
           note = :note,
           department = :department,
           owner_user = :owner_user,
           status = COALESCE(:status, status),
           updated_at = datetime('now','localtime')
       WHERE ip_address = :ip`,
      { replacements: { assigned_mac, note, status, department, owner_user, ip: req.params.ip } }
    );
    await writeLog("user", "update", req.params.ip, `编辑IP 部门=${department || ""} 用户=${owner_user || ""}`);
    return res.json({ code: 0, message: "ip assignment updated" });
  } catch (error) {
    return next(error);
  }
}

async function deleteIp(req, res, next) {
  try {
    await sequelize.query(
      `UPDATE ip_assignments
       SET status = 'free', assigned_mac = NULL, note = NULL, department = NULL, owner_user = NULL, updated_at = datetime('now','localtime')
       WHERE ip_address = :ip`,
      { replacements: { ip: req.params.ip } }
    );
    await writeLog("user", "release", req.params.ip, "释放IP");
    return res.json({ code: 0, message: "ip released" });
  } catch (error) {
    return next(error);
  }
}

async function checkIp(req, res, next) {
  try {
    const ip = req.query.ip || null;
    if (!ip) {
      return res.status(400).json({ code: 400, message: "ip query is required" });
    }

    const [rows] = await sequelize.query(
      `SELECT ip_address, status, assigned_mac
       FROM ip_assignments
       WHERE ip_address = :ip
       LIMIT 1`,
      { replacements: { ip } }
    );
    const row = rows[0];
    const conflict = !!row && row.status === "conflict";

    return res.json({
      code: 0,
      message: "ok",
      data: {
        ip,
        online: false,
        assignedMac: row?.assigned_mac || null,
        conflict,
        reason: conflict ? "database_conflict" : null,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function exportExcel(req, res, next) {
  try {
    const [rows] = await sequelize.query(
      `SELECT
          ipa.ip_address,
          CASE
            WHEN ipa.status = 'conflict' THEN 'conflict'
            WHEN ipa.online_flag = 1 THEN 'online'
            ELSE 'offline'
          END AS display_status,
          ipa.assigned_mac,
          d.hostname,
          d.vendor,
          ipa.department,
          ipa.owner_user,
          ipa.note,
          ipa.last_online
       FROM ip_assignments ipa
       LEFT JOIN devices d ON d.mac = ipa.assigned_mac
       ORDER BY ${orderByIpv4NumericAsc("ipa")}`
    );

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("IP地址列表");

    const statusMap = { online: "在线", offline: "离线", conflict: "冲突" };

    sheet.columns = [
      { header: "序号", key: "index", width: 8 },
      { header: "IP 地址", key: "ip_address", width: 18 },
      { header: "状态", key: "status", width: 10 },
      { header: "名称", key: "hostname", width: 25 },
      { header: "制造商", key: "vendor", width: 30 },
      { header: "MAC 地址", key: "assigned_mac", width: 20 },
      { header: "部门", key: "department", width: 15 },
      { header: "用户", key: "owner_user", width: 15 },
      { header: "备注", key: "note", width: 20 },
      { header: "最后在线时间", key: "last_online", width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    rows.forEach((row, i) => {
      sheet.addRow({
        index: i + 1,
        ip_address: row.ip_address,
        status: statusMap[row.display_status] || row.display_status,
        hostname: row.hostname || "",
        vendor: row.vendor || "",
        assigned_mac: row.assigned_mac || "",
        department: row.department || "",
        owner_user: row.owner_user || "",
        note: row.note || "",
        last_online: row.last_online || "",
      });
    });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename = `IP地址列表_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listIps,
  getIpDetail,
  createIp,
  updateIp,
  deleteIp,
  checkIp,
  exportExcel,
};
