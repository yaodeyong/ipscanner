/**
 * 命令行网络诊断（逻辑在后端 services，与页面/API 共用）。
 * 用法：node tools/network-diagnose.js
 */

const path = require("path");

// 从项目根运行：node tools/network-diagnose.js
const { runNetworkDiagnostics } = require(path.join(__dirname, "../backend/src/services/network-diag.service.js"));

runNetworkDiagnostics()
  .then((r) => {
    console.log(r.textReport);
    console.log("");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
