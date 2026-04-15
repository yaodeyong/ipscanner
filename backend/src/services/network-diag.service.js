const os = require("os");
const dns = require("dns").promises;
const https = require("https");
const net = require("net");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function listIpv4Interfaces() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifs)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== "IPv4" && a.family !== 4) continue;
      if (a.internal) continue;
      out.push({
        name,
        address: a.address,
        netmask: a.netmask || null,
        mac: a.mac || null,
      });
    }
  }
  return out;
}

function tcpConnectMs(host, port, timeoutMs = 8000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, family: 4, timeout: timeoutMs }, () => {
      const ms = Date.now() - t0;
      socket.destroy();
      resolve({ ok: true, ms });
    });
    socket.on("error", () => resolve({ ok: false, ms: Date.now() - t0, err: "tcp_error" }));
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, ms: null, err: "timeout" });
    });
  });
}

async function dnsResolveMs(hostname) {
  const t0 = Date.now();
  try {
    await dns.resolve4(hostname);
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, err: e.message };
  }
}

function httpsHeadMs(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = https.request(
      url,
      { method: "HEAD", timeout: timeoutMs, rejectUnauthorized: true },
      (res) => {
        res.resume();
        const ms = Date.now() - t0;
        resolve({ ok: true, ms, status: res.statusCode });
      }
    );
    req.on("error", (e) => resolve({ ok: false, err: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, err: "timeout" });
    });
    req.end();
  });
}

function pingStdoutToString(bufOrStr) {
  if (bufOrStr == null) return "";
  if (Buffer.isBuffer(bufOrStr)) return bufOrStr.toString("utf8");
  return String(bufOrStr);
}

async function runPowerShellJson(script) {
  if (os.platform() !== "win32") return null;
  try {
    const wrapped = `${script} | ConvertTo-Json -Depth 4`;
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", wrapped],
      {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
        encoding: "utf8",
      }
    );
    if (!stdout) return null;
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function pingWindows(host, count = 3) {
  let stdout = "";
  const isWin = os.platform() === "win32";
  try {
    if (isWin) {
      const inner = `chcp 65001>nul & ping -n ${count} -w 3000 ${host}`;
      const r = await execFileAsync("cmd.exe", ["/d", "/s", "/c", inner], {
        windowsHide: true,
        timeout: 25000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8",
      });
      stdout = r.stdout || "";
    } else {
      const r = await execFileAsync("ping", ["-n", String(count), "-W", "3", host], {
        timeout: 20000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8",
      });
      stdout = r.stdout || "";
    }
  } catch (e) {
    stdout = pingStdoutToString(e.stdout);
    if (!stdout) return { ok: false, err: e.message };
  }

  const times = [];
  let m;
  const reEq = /(?:time|时间)=(\d+)\s*ms/gi;
  while ((m = reEq.exec(stdout)) !== null) {
    times.push(Number(m[1]));
  }
  if (/(?:time|时间)<\s*1\s*ms/i.test(stdout)) times.push(0);

  const avgLine = stdout.match(/(?:平均|Average)\s*[=:：]\s*(\d+)\s*ms/i);
  if (avgLine) {
    return { ok: true, avgMs: Number(avgLine[1]), samples: times.length ? times : [Number(avgLine[1])] };
  }
  if (!times.length) return { ok: false, raw: stdout.slice(0, 500) };
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  return { ok: true, avgMs: avg, samples: times };
}

function summarizeResult(label, r) {
  if (r.ok && r.avgMs !== undefined) {
    return { label, ok: true, summary: `平均约 ${r.avgMs} ms`, detail: { avgMs: r.avgMs, samples: r.samples } };
  }
  if (r.ok && r.ms !== undefined) {
    return {
      label,
      ok: true,
      summary: `${r.ms} ms`,
      detail: r.status ? { ms: r.ms, httpStatus: r.status } : { ms: r.ms },
    };
  }
  return {
    label,
    ok: false,
    summary: "失败",
    detail: { err: r.err, raw: r.raw },
  };
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseLinkSpeedMbps(linkSpeed) {
  const text = String(linkSpeed || "");
  const mG = text.match(/(\d+(?:\.\d+)?)\s*Gbps/i);
  if (mG) return Math.round(Number(mG[1]) * 1000);
  const mM = text.match(/(\d+(?:\.\d+)?)\s*Mbps/i);
  if (mM) return Math.round(Number(mM[1]));
  return null;
}

function buildHints(ctx) {
  const hints = [];
  const { tests, gateways, defaultRoutes, adapters } = ctx;

  const pingCloudflare = tests.find((t) => t.label.includes("8.8.8.8"));
  const githubHead = tests.find((t) => t.label.includes("github.com"));

  const badGateway = gateways.find((g) => !g.ping.ok);
  if (badGateway) {
    hints.push({
      level: "high",
      title: "到网关延迟/丢包异常",
      detail: `网关 ${badGateway.gateway} ping 失败或丢包，优先检查网线、交换机端口、路由器负载和 QoS。`,
    });
  }

  if (pingCloudflare?.ok && githubHead?.ok && Number(githubHead.detail?.ms || githubHead.summary?.replace(/\D/g, "")) > 800) {
    hints.push({
      level: "medium",
      title: "公网基础连通正常但 HTTPS 慢",
      detail: "常见于代理策略、DNS、出口线路质量或防火墙策略差异。建议对比插网线前后默认路由和代理组。",
    });
  }

  if ((defaultRoutes || []).length > 1) {
    hints.push({
      level: "medium",
      title: "检测到多条默认路由",
      detail: "有线/WiFi/虚拟网卡可能发生抢路由，建议临时禁用不用网卡后重测，或调整接口跃点数。",
    });
  }

  const slowAdapters = (adapters || []).filter((a) => (a.linkSpeedMbps || 0) > 0 && a.linkSpeedMbps <= 100);
  if (slowAdapters.length) {
    hints.push({
      level: "high",
      title: "网卡协商速率偏低",
      detail: `以下网卡链路速率 <=100Mbps：${slowAdapters.map((a) => `${a.name}(${a.linkSpeedRaw})`).join("，")}。可能是网线/端口/双工协商问题。`,
    });
  }

  if (!hints.length) {
    hints.push({
      level: "info",
      title: "未发现明显硬故障特征",
      detail: "建议保存当前快照，再在“WiFi-only”和“有线-only”各跑一次对比，重点看默认路由和网关 ping。",
    });
  }
  return hints;
}

/**
 * 执行网络诊断，返回结构化结果 + 纯文本报告（便于页面展示与复制）。
 */
async function runNetworkDiagnostics() {
  const lines = [];
  const push = (s) => lines.push(s);

  push("======== 网络诊断 ========");
  push(`时间: ${new Date().toLocaleString("zh-CN")}`);
  push(`主机: ${os.hostname()} | 平台: ${os.platform()} ${os.release()}`);

  const interfaces = listIpv4Interfaces();

  const psRoutes = toArray(
    await runPowerShellJson("Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Select-Object ifIndex,InterfaceAlias,NextHop,RouteMetric,ifMetric")
  );
  const defaultRoutes = psRoutes
    .map((r) => ({
      ifIndex: r.ifIndex,
      interfaceAlias: r.InterfaceAlias || null,
      nextHop: r.NextHop || null,
      routeMetric: Number(r.RouteMetric || 0),
      interfaceMetric: Number(r.ifMetric || 0),
      effectiveMetric: Number(r.RouteMetric || 0) + Number(r.ifMetric || 0),
    }))
    .sort((a, b) => a.effectiveMetric - b.effectiveMetric);

  const psAdapters = toArray(
    await runPowerShellJson("Get-NetAdapter | Select-Object Name,Status,LinkSpeed,MacAddress")
  );
  const adapters = psAdapters.map((a) => ({
    name: a.Name || null,
    status: a.Status || null,
    linkSpeedRaw: a.LinkSpeed || null,
    linkSpeedMbps: parseLinkSpeedMbps(a.LinkSpeed),
    mac: a.MacAddress || null,
  }));

  const psGatewayCfg = toArray(
    await runPowerShellJson("Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null} | Select-Object InterfaceAlias,@{Name='Gateway';Expression={$_.IPv4DefaultGateway.NextHop}}")
  );
  const gateways = [];
  for (const g of psGatewayCfg) {
    const gw = g.Gateway || g.gateway;
    if (!gw) continue;
    const ping = await pingWindows(gw, 4);
    gateways.push({
      interfaceAlias: g.InterfaceAlias || null,
      gateway: gw,
      ping,
    });
  }
  push("");
  push("--- 本机 IPv4 网卡（非回环）---");
  if (!interfaces.length) {
    push("(无)");
  } else {
    for (const x of interfaces) {
      push(`  ${String(x.name).padEnd(28)} ${String(x.address).padEnd(16)} 掩码 ${x.netmask || "-"}  MAC ${x.mac || "-"}`);
    }
  }

  const targets = [
    { label: "ICMP ping  114.114.114.114", fn: () => pingWindows("114.114.114.114", 3) },
    { label: "ICMP ping  8.8.8.8", fn: () => pingWindows("8.8.8.8", 3) },
    { label: "TCP 连接  1.1.1.1:443 (Cloudflare)", fn: () => tcpConnectMs("1.1.1.1", 443) },
    { label: "TCP 连接  223.5.5.5:53 (阿里 DNS)", fn: () => tcpConnectMs("223.5.5.5", 53) },
    { label: "DNS 解析  www.baidu.com", fn: () => dnsResolveMs("www.baidu.com") },
    { label: "HTTPS HEAD www.baidu.com", fn: () => httpsHeadMs("https://www.baidu.com") },
    { label: "HTTPS HEAD github.com", fn: () => httpsHeadMs("https://github.com") },
  ];

  const tests = [];
  push("");
  push("--- 连通与延迟 ---");
  for (const t of targets) {
    const r = await t.fn();
    let line;
    if (r.ok && r.avgMs !== undefined) {
      line = `  ${t.label} ... 平均约 ${r.avgMs} ms (样本 ${JSON.stringify(r.samples)})`;
    } else if (r.ok && r.ms !== undefined) {
      line = `  ${t.label} ... ${r.ms} ms${r.status ? ` HTTP ${r.status}` : ""}`;
    } else {
      line = `  ${t.label} ... 失败 ${r.err || r.raw || ""}`;
    }
    push(line);
    tests.push(summarizeResult(t.label, r));
  }

  const proxy =
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.https_proxy ||
    null;
  push("");
  push("--- 代理环境变量 ---");
  push(proxy ? `  已设置: ${proxy}` : "  (未设置，直连)");

  push("");
  push("--- 提示 ---");
  push("  插网线前后各运行一次本诊断，对比 ping / TCP / HTTPS 哪项变差。");
  push("  若装有 Mihomo/Clash TUN，注意与默认路由、有线网卡的关系。");

  if (defaultRoutes.length) {
    push("");
    push("--- 默认路由（按有效跃点从小到大）---");
    defaultRoutes.forEach((r) => {
      push(`  ${r.interfaceAlias || "-"} -> ${r.nextHop || "-"}  metric=${r.effectiveMetric} (${r.routeMetric}+${r.interfaceMetric})`);
    });
  }

  if (gateways.length) {
    push("");
    push("--- 网关连通性 ---");
    gateways.forEach((g) => {
      if (g.ping.ok) {
        push(`  ${g.interfaceAlias || "-"} 网关 ${g.gateway} ping 平均约 ${g.ping.avgMs} ms`);
      } else {
        push(`  ${g.interfaceAlias || "-"} 网关 ${g.gateway} ping 失败`);
      }
    });
  }

  const hints = buildHints({
    tests,
    gateways,
    defaultRoutes,
    adapters,
  });

  return {
    generatedAt: new Date().toISOString(),
    generatedAtLocal: new Date().toLocaleString("zh-CN"),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    interfaces,
    defaultRoutes,
    gateways,
    adapters,
    tests,
    proxy,
    hints,
    textReport: lines.join("\n"),
  };
}

module.exports = {
  runNetworkDiagnostics,
  listIpv4Interfaces,
};
