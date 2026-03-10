const { runNetworkScan, applyNetworkScan } = require("../services/scan.service");
const { writeLog } = require("./log.controller");

let isScanning = false;

async function triggerScan(req, res, next) {
  if (isScanning) {
    return res.status(429).json({
      code: 429,
      message: "scan already running",
    });
  }

  isScanning = true;
  try {
    const apply = Boolean(req.body?.apply);
    const result = apply ? await applyNetworkScan() : await runNetworkScan();

    if (apply) {
      await writeLog("system", "scan_apply", null, `发现${result.discovered}台设备, 新增${result.inserted}, 更新${result.updated}, 冲突${result.conflicts}`);
    }

    return res.json({
      code: 0,
      message: apply ? "scan completed and saved" : "scan preview completed",
      data: {
        startedAt: new Date().toISOString(),
        mode: apply ? "apply" : "preview",
        ...result,
      },
    });
  } catch (error) {
    return next(error);
  } finally {
    isScanning = false;
  }
}

module.exports = {
  triggerScan,
};
