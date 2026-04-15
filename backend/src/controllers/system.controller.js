const { sequelize } = require("../config/database");
const path = require("path");
const fs = require("fs");
const env = require("../config/env");
const { runNetworkDiagnostics } = require("../services/network-diag.service");

function normalizeLevel(level) {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function getTestMs(test) {
  if (!test || !test.ok) return null;
  const avg = Number(test.detail?.avgMs);
  if (Number.isFinite(avg)) return avg;
  const ms = Number(test.detail?.ms);
  if (Number.isFinite(ms)) return ms;
  const m = String(test.summary || "").match(/(\d+)\s*ms/i);
  return m ? Number(m[1]) : null;
}

async function insertNetworkDiagReport(data, label = "") {
  const [, meta] = await sequelize.query(
    `INSERT INTO network_diag_reports
      (label, generated_at, hostname, platform, proxy, tests_json, hints_json, routes_json, gateways_json, adapters_json, interfaces_json, text_report)
     VALUES
      (:label, datetime('now','localtime'), :hostname, :platform, :proxy, :tests_json, :hints_json, :routes_json, :gateways_json, :adapters_json, :interfaces_json, :text_report)`,
    {
      replacements: {
        label: label || null,
        hostname: data.hostname || null,
        platform: data.platform || null,
        proxy: data.proxy || null,
        tests_json: JSON.stringify(data.tests || []),
        hints_json: JSON.stringify(data.hints || []),
        routes_json: JSON.stringify(data.defaultRoutes || []),
        gateways_json: JSON.stringify(data.gateways || []),
        adapters_json: JSON.stringify(data.adapters || []),
        interfaces_json: JSON.stringify(data.interfaces || []),
        text_report: data.textReport || null,
      },
    }
  );

  return meta;
}

function parseJsonSafe(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function getDiagReportById(id) {
  const [rows] = await sequelize.query(
    `SELECT id, label, created_at, generated_at, hostname, platform, proxy,
            tests_json, hints_json, routes_json, gateways_json, adapters_json, interfaces_json, text_report
     FROM network_diag_reports
     WHERE id = :id
     LIMIT 1`,
    { replacements: { id } }
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    label: row.label,
    created_at: row.created_at,
    generated_at: row.generated_at,
    hostname: row.hostname,
    platform: row.platform,
    proxy: row.proxy,
    tests: parseJsonSafe(row.tests_json, []),
    hints: parseJsonSafe(row.hints_json, []),
    defaultRoutes: parseJsonSafe(row.routes_json, []),
    gateways: parseJsonSafe(row.gateways_json, []),
    adapters: parseJsonSafe(row.adapters_json, []),
    interfaces: parseJsonSafe(row.interfaces_json, []),
    textReport: row.text_report || "",
  };
}

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

async function getNetworkDiagnostics(req, res, next) {
  req.setTimeout(180000);
  res.setTimeout(180000);
  try {
    const label = String(req.query.label || req.body?.label || "").trim();
    const data = await runNetworkDiagnostics();
    const inserted = await insertNetworkDiagReport(data, label);
    const reportId = Number(inserted?.lastID || 0);
    return res.json({ code: 0, message: "ok", data: { ...data, reportId } });
  } catch (error) {
    return next(error);
  }
}

async function listNetworkDiagReports(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const [rows] = await sequelize.query(
      `SELECT id, label, created_at, generated_at, hostname, platform, proxy
       FROM network_diag_reports
       ORDER BY id DESC
       LIMIT :limit`,
      { replacements: { limit } }
    );
    return res.json({ code: 0, message: "ok", data: { items: rows } });
  } catch (error) {
    return next(error);
  }
}

async function getNetworkDiagReportDetail(req, res, next) {
  try {
    const report = await getDiagReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ code: 404, message: "报告不存在" });
    }
    return res.json({ code: 0, message: "ok", data: report });
  } catch (error) {
    return next(error);
  }
}

async function buildNetworkConclusionReport(req, res, next) {
  try {
    const currentId = Number(req.query.currentId || req.body?.currentId || 0);
    const baselineId = Number(req.query.baselineId || req.body?.baselineId || 0);
    if (!currentId) {
      return res.status(400).json({ code: 400, message: "currentId is required" });
    }

    const current = await getDiagReportById(currentId);
    if (!current) {
      return res.status(404).json({ code: 404, message: "当前报告不存在" });
    }
    const baseline = baselineId ? await getDiagReportById(baselineId) : null;

    const sortedHints = [...(current.hints || [])].sort(
      (a, b) => normalizeLevel(b.level) - normalizeLevel(a.level)
    );

    const compareRows = [];
    if (baseline) {
      for (const t of current.tests || []) {
        const old = (baseline.tests || []).find((x) => x.label === t.label);
        const newMs = getTestMs(t);
        const oldMs = getTestMs(old);
        if (Number.isFinite(newMs) && Number.isFinite(oldMs)) {
          compareRows.push({
            label: t.label,
            current: newMs,
            baseline: oldMs,
            delta: newMs - oldMs,
          });
        }
      }
    }

    const severeChanges = compareRows
      .filter((x) => x.delta >= 80)
      .sort((a, b) => b.delta - a.delta);

    const checklist = [
      "先只保留一条出口（仅有线或仅WiFi）重测，排除多网卡抢路由。",
      "检查默认路由有效跃点，确认流量是否走到预期网关。",
      "检查网卡协商速率（是否只有100Mbps）并更换网线/端口交叉验证。",
      "对网关做100次 ping，若丢包或抖动大，优先排查交换机/路由器/QoS。",
      "临时关闭 Clash/Mihomo TUN 或策略代理再测，排除代理链路干扰。",
      "若仅某些目标慢（如 GitHub），检查 DNS 与出口线路策略差异。",
    ];

    const lines = [];
    lines.push("【网络排障一键结论报告】");
    lines.push(`生成时间: ${new Date().toLocaleString("zh-CN")}`);
    lines.push(`当前报告ID: ${current.id} (${current.created_at})`);
    if (baseline) {
      lines.push(`对比基线ID: ${baseline.id} (${baseline.created_at})`);
    }
    lines.push("");
    lines.push("一、疑似原因排序（高 -> 低）");
    if (!sortedHints.length) {
      lines.push("1) 暂无明确异常特征（建议继续做有线/WiFi对照采样）");
    } else {
      sortedHints.forEach((h, i) => {
        lines.push(`${i + 1}) [${h.level || "info"}] ${h.title}`);
        lines.push(`   - ${h.detail}`);
      });
    }

    if (severeChanges.length) {
      lines.push("");
      lines.push("二、与基线相比显著变慢项（>=80ms）");
      severeChanges.forEach((x, i) => {
        lines.push(`${i + 1}) ${x.label}: ${x.baseline}ms -> ${x.current}ms ( +${x.delta}ms )`);
      });
    }

    lines.push("");
    lines.push("三、建议操作清单（按顺序执行）");
    checklist.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
    lines.push("");
    lines.push("四、附注");
    lines.push(`- 主机: ${current.hostname || "-"} / ${current.platform || "-"}`);
    lines.push(`- 代理环境变量: ${current.proxy || "未检测到（直连）"}`);

    return res.json({
      code: 0,
      message: "ok",
      data: {
        currentId: current.id,
        baselineId: baseline?.id || null,
        sortedHints,
        severeChanges,
        checklist,
        textReport: lines.join("\n"),
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSystemInfo,
  clearLogs,
  getNetworkDiagnostics,
  listNetworkDiagReports,
  getNetworkDiagReportDetail,
  buildNetworkConclusionReport,
};
