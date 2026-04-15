const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

const env = {
  port: Number(process.env.PORT || 3001),
  db: {
    storage: process.env.DB_PATH || path.resolve(__dirname, "..", "..", "data", "ipscanner.db"),
  },
  scan: {
    /** Windows ping -w：单次等待毫秒数，越大越易扫到慢响应主机（默认 800） */
    pingTimeoutMs: Math.min(5000, Math.max(100, Number(process.env.SCAN_PING_TIMEOUT_MS || 800))),
    /** 逗号分隔的三段前缀，如 192.168.10（与本机网卡前缀合并，用于 ARP 预热） */
    subnetPrefixes: String(process.env.SCAN_SUBNET_PREFIXES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    /** 设为 1 则跳过整网段 ping 预热（仅读当前 ARP，最快但 MAC 最少） */
    skipWarm: process.env.SCAN_SKIP_WARM === "1" || process.env.SCAN_SKIP_WARM === "true",
    /** 每批并发 ping 数量（默认 24，过大可能丢包） */
    pingBatchSize: Math.min(64, Math.max(8, Number(process.env.SCAN_PING_BATCH_SIZE || 24))),
  },
};

module.exports = env;
