const app = require("./app");
const env = require("./config/env");
const { initDatabase } = require("./config/database");

(async () => {
  await initDatabase();
  const server = app.listen(env.port, () => {
    console.log(`[ipscanner-backend] listening on port ${env.port}`);
  });
  server.timeout = 180000;
  server.headersTimeout = 185000;
})();
