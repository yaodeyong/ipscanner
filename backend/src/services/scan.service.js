const { exec } = require("child_process");
const { promisify } = require("util");
const os = require("os");
const net = require("net");
const http = require("http");
const https = require("https");
const { sequelize } = require("../config/database");

const execAsync = promisify(exec);
const vendorCache = new Map();
const knownVendors = {
  "F88C21": "TP-LINK TECHNOLOGIES CO.,LTD.",
  "F42A7D": "TP-LINK TECHNOLOGIES CO.,LTD.",
  "3C06A7": "TP-LINK TECHNOLOGIES CO.,LTD.",
  "584120": "TP-LINK TECHNOLOGIES CO.,LTD.",
};
const commonPorts = [80, 443, 445, 139, 3389, 21];

function cleanText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMac(mac) {
  if (!mac) return null;
  const hex = String(mac).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{1,2}/g).join(":");
}

function parseArpOutput(output) {
  const lines = output.split(/\r?\n/);
  const devices = [];
  const seen = new Set();
  const rowRegex = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-fA-F:-]{17})\s+/;

  for (const line of lines) {
    const matched = line.match(rowRegex);
    if (!matched) continue;
    const ip = matched[1];
    const octets = ip.split(".").map(Number);
    if (octets[0] >= 224 || ip.endsWith(".255")) continue;
    const mac = normalizeMac(matched[2]);
    if (!mac || mac === "FF:FF:FF:FF:FF:FF" || mac.startsWith("01:00:5E")) continue;
    const key = `${ip}_${mac}`;
    if (seen.has(key)) continue;
    seen.add(key);
    devices.push({ ip, mac });
  }

  return devices;
}

function mergeMacList(currentValue, incomingMacs) {
  const merged = new Set();
  if (currentValue) {
    currentValue
      .split(",")
      .map((v) => normalizeMac(v.trim()))
      .filter(Boolean)
      .forEach((v) => merged.add(v));
  }
  incomingMacs.map(normalizeMac).filter(Boolean).forEach((v) => merged.add(v));
  return Array.from(merged).join(",");
}

async function resolveHostname(ip, options = {}) {
  const { preferNetbios = true } = options;
  try {
    if (preferNetbios) {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 1200 });
      const lines = (stdout || "").split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
      for (const line of lines) {
        const m = line.match(/^([^\s<]+)\s+<00>\s+UNIQUE/i);
        if (m?.[1] && m[1] !== "WORKGROUP") {
          return m[1];
        }
      }
    }
  } catch (error) {
    // Continue with DNS fallback.
  }

  try {
    const { stdout } = await execAsync(`nslookup ${ip}`, { timeout: 1200 });
    const matched = (stdout || "").match(/(?:Name|名称)\s*[:：]\s*(\S+)/i) || (stdout || "").match(/name\s*=\s*(\S+)/i);
    if (matched?.[1]) return matched[1];
    return null;
  } catch (error) {
    return null;
  }
}

async function resolveVendor(mac, transaction) {
  const prefix = String(mac || "").replace(/:/g, "").slice(0, 6).toUpperCase();
  if (!prefix) return "Unknown";
  if (vendorCache.has(prefix)) return vendorCache.get(prefix);

  const [rows] = await sequelize.query(
    `SELECT vendor FROM oui WHERE UPPER(oui) = :prefix LIMIT 1`,
    { replacements: { prefix }, transaction }
  );
  const vendor = rows[0]?.vendor || knownVendors[prefix] || "Unknown";
  vendorCache.set(prefix, vendor);
  return vendor;
}

function probePort(ip, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.connect(port, ip);
  });
}

function fetchHttpTitle(ip, secure = false, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const client = secure ? https : http;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = client.request(
      {
        host: ip,
        method: "GET",
        path: "/",
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString("utf8");
          if (body.length > 6000) {
            body = body.slice(0, 6000);
          }
        });
        res.on("end", () => {
          const m = body.match(/<title[^>]*>([^<]+)<\/title>/i);
          finish(m?.[1] ? cleanText(m[1]) : null);
        });
        res.on("close", () => finish(null));
      }
    );
    req.on("error", () => finish(null));
    req.on("timeout", () => {
      req.destroy();
      finish(null);
    });
    req.end();
  });
}

async function detectServiceInfo(ip) {
  const checks = await Promise.all(commonPorts.map(async (port) => ({ port, open: await probePort(ip, port) })));
  const openPorts = checks.filter((v) => v.open).map((v) => v.port);
  if (!openPorts.length) return { openPorts: [], serviceHint: null };

  const hints = [];
  if (openPorts.includes(445) || openPorts.includes(139)) hints.push("IPC");
  if (openPorts.includes(3389)) hints.push("RDP");
  if (openPorts.includes(21)) hints.push("FTP");

  let title = null;
  if (openPorts.includes(80)) title = await fetchHttpTitle(ip, false);
  if (!title && openPorts.includes(443)) title = await fetchHttpTitle(ip, true);
  if (title) hints.unshift(title);

  return { openPorts, serviceHint: hints.join(" | ") || null };
}

async function mapWithConcurrency(items, worker, limit = 12) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function upsertDevice(device, transaction) {
  const { mac, vendor, hostname } = device;
  await sequelize.query(
    `INSERT INTO devices (mac, vendor, hostname, first_seen, last_seen)
     VALUES (:mac, :vendor, :hostname, datetime('now','localtime'), datetime('now','localtime'))
     ON CONFLICT(mac) DO UPDATE SET
       vendor = COALESCE(:vendor, devices.vendor),
       hostname = COALESCE(:hostname, devices.hostname),
       last_seen = datetime('now','localtime')`,
    { replacements: { mac, vendor, hostname }, transaction }
  );
}

async function upsertConflict(ip, macList, transaction) {
  const [rows] = await sequelize.query(
    `SELECT id, mac_addresses
     FROM conflicts
     WHERE ip_address = :ip AND resolved = 0
     ORDER BY id DESC
     LIMIT 1`,
    { replacements: { ip }, transaction }
  );

  if (!rows.length) {
    await sequelize.query(
      `INSERT INTO conflicts (ip_address, mac_addresses, detected_at, last_detected, resolved, resolved_at, resolution_note)
       VALUES (:ip, :mac_addresses, datetime('now','localtime'), datetime('now','localtime'), 0, NULL, NULL)`,
      { replacements: { ip, mac_addresses: macList }, transaction }
    );
    return;
  }

  const merged = mergeMacList(rows[0].mac_addresses, macList.split(","));
  await sequelize.query(
    `UPDATE conflicts
     SET mac_addresses = :mac_addresses, last_detected = datetime('now','localtime')
     WHERE id = :id`,
    { replacements: { id: rows[0].id, mac_addresses: merged }, transaction }
  );
}

async function buildPreview(devices) {
  if (!devices.length) {
    return { changes: [], discovered: 0, pendingChanges: 0 };
  }

  const [rows] = await sequelize.query(
    `SELECT ip_address, assigned_mac FROM ip_assignments WHERE ip_address IN (:ips)`,
    { replacements: { ips: devices.map((d) => d.ip) } }
  );
  const [deviceRows] = await sequelize.query(
    `SELECT mac, vendor, hostname FROM devices WHERE mac IN (:macs)`,
    { replacements: { macs: devices.map((d) => d.mac) } }
  );
  const dbMap = new Map(rows.map((row) => [row.ip_address, normalizeMac(row.assigned_mac)]));
  const deviceMap = new Map(deviceRows.map((row) => [normalizeMac(row.mac), row]));
  const changes = [];

  for (const device of devices) {
    const dbMac = dbMap.get(device.ip);
    if (!dbMap.has(device.ip)) {
      changes.push({
        type: "new",
        ip: device.ip,
        mac: device.mac,
        hostname: device.hostname,
        vendor: device.vendor,
        message: "新设备",
      });
      continue;
    }
    if (dbMac && dbMac !== device.mac) {
      changes.push({
        type: "mac_changed",
        ip: device.ip,
        mac: device.mac,
        previousMac: dbMac,
        hostname: device.hostname,
        vendor: device.vendor,
        message: "MAC 变化，可能冲突",
      });
      continue;
    }

    if (dbMac && dbMac === device.mac) {
      const stored = deviceMap.get(device.mac);
      const prevVendor = cleanText(stored?.vendor || "");
      const prevHostname = cleanText(stored?.hostname || "");
      const nextVendor = cleanText(device.vendor || "");
      const nextHostname = cleanText(device.hostname || "");
      if (prevVendor !== nextVendor || prevHostname !== nextHostname) {
        changes.push({
          type: "meta_changed",
          ip: device.ip,
          mac: device.mac,
          previousVendor: prevVendor || null,
          previousHostname: prevHostname || null,
          vendor: nextVendor || null,
          hostname: nextHostname || null,
          message: "名称或制造商变化",
        });
      }
    }
  }

  return { changes, discovered: devices.length, pendingChanges: changes.length };
}

async function persistScanResult(devices) {
  let inserted = 0;
  let updated = 0;
  let conflicts = 0;

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `UPDATE ip_assignments SET online_flag = 0, updated_at = datetime('now','localtime')`,
      { transaction }
    );

    for (const device of devices) {
      const { ip, mac } = device;
      await upsertDevice(device, transaction);

      const [rows] = await sequelize.query(
        `SELECT id, status, assigned_mac
         FROM ip_assignments
         WHERE ip_address = :ip
         LIMIT 1`,
        { replacements: { ip }, transaction }
      );

      if (!rows.length) {
        await sequelize.query(
          `INSERT INTO ip_assignments (ip_address, status, assigned_mac, assigned_date, note, last_online, online_flag)
           VALUES (:ip, 'assigned', :mac, datetime('now','localtime'), 'auto_discovered', datetime('now','localtime'), 1)`,
          { replacements: { ip, mac }, transaction }
        );
        inserted += 1;
        continue;
      }

      const row = rows[0];
      const storedMac = normalizeMac(row.assigned_mac);
      if (storedMac && storedMac !== mac) {
        await sequelize.query(
          `UPDATE ip_assignments
           SET status = 'conflict', last_online = datetime('now','localtime'), online_flag = 1, updated_at = datetime('now','localtime')
           WHERE id = :id`,
          { replacements: { id: row.id }, transaction }
        );
        await upsertConflict(ip, `${storedMac},${mac}`, transaction);
        conflicts += 1;
        updated += 1;
        continue;
      }

      await sequelize.query(
        `UPDATE ip_assignments
         SET assigned_mac = COALESCE(assigned_mac, :mac),
             status = CASE
               WHEN status = 'free' OR status = 'unknown' THEN 'assigned'
               ELSE status
             END,
             last_online = datetime('now','localtime'),
             online_flag = 1,
             updated_at = datetime('now','localtime')
         WHERE id = :id`,
        { replacements: { id: row.id, mac }, transaction }
      );
      updated += 1;
    }
  });

  return { inserted, updated, conflicts };
}

function getCandidateSubnets() {
  const interfaces = os.networkInterfaces();
  const prefixes = new Set();

  Object.values(interfaces)
    .flat()
    .filter(Boolean)
    .forEach((iface) => {
      if (iface.internal || iface.family !== "IPv4") return;
      const parts = iface.address.split(".");
      if (parts.length !== 4) return;
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
    });

  return Array.from(prefixes);
}

async function pingSweep(prefix, timeoutMs = 150) {
  const ips = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
  const batchSize = 48;

  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (ip) => {
        try {
          await execAsync(`ping -n 1 -w ${timeoutMs} ${ip} >nul`);
        } catch (error) {
          // Ignore unreachable targets; this pass only warms ARP table.
        }
      })
    );
  }
}

async function warmArpCache() {
  const subnets = getCandidateSubnets();
  for (const prefix of subnets) {
    await pingSweep(prefix);
  }
}

async function runNetworkScan() {
  let { stdout } = await execAsync("arp -a");
  let devices = parseArpOutput(stdout || "");

  if (!devices.length) {
    await warmArpCache();
    ({ stdout } = await execAsync("arp -a"));
    devices = parseArpOutput(stdout || "");
  }

  if (!devices.length) {
    return {
      discovered: 0,
      pendingChanges: 0,
      changes: [],
      devices: [],
    };
  }

  const enrichedDevices = await mapWithConcurrency(
    devices,
    async (device) => {
      const [vendor, serviceInfo] = await Promise.all([
        resolveVendor(device.mac),
        detectServiceInfo(device.ip),
      ]);

      const hostnameRaw = await resolveHostname(device.ip, {
        preferNetbios: serviceInfo.openPorts.includes(139) || serviceInfo.openPorts.includes(445),
      });
      const hostname = hostnameRaw || serviceInfo.serviceHint || device.ip;
      return {
        ...device,
        vendor,
        hostname,
        openPorts: serviceInfo.openPorts,
        serviceHint: serviceInfo.serviceHint,
      };
    },
    10
  );

  const preview = await buildPreview(enrichedDevices);
  return {
    ...preview,
    devices: enrichedDevices,
  };
}

async function applyNetworkScan() {
  const scan = await runNetworkScan();
  const result = await persistScanResult(scan.devices);
  return {
    discovered: scan.discovered,
    pendingChanges: scan.pendingChanges,
    changes: scan.changes,
    ...result,
    devices: scan.devices,
  };
}

module.exports = {
  runNetworkScan,
  applyNetworkScan,
};
