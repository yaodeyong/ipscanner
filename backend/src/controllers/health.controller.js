const { testDatabaseConnection } = require("../config/database");

async function healthCheck(req, res) {
  const dbStatus = await testDatabaseConnection();

  return res.status(200).json({
    code: 0,
    message: "ok",
    data: {
      service: "ipscanner-backend",
      time: new Date().toISOString(),
      database: dbStatus,
    },
  });
}

module.exports = {
  healthCheck,
};
