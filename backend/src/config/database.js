const path = require("path");
const { Sequelize } = require("sequelize");
const env = require("./env");

const dbPath = env.db.storage || path.resolve(__dirname, "..", "..", "data", "ipscanner.db");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: dbPath,
  logging: false,
});

async function initDatabase() {
  const fs = require("fs");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ip_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address VARCHAR(15) NOT NULL UNIQUE,
      subnet_mask VARCHAR(15),
      status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free','assigned','conflict','unknown')),
      assigned_mac VARCHAR(17),
      assigned_date DATETIME,
      online_flag INTEGER NOT NULL DEFAULT 0,
      department VARCHAR(100),
      owner_user VARCHAR(100),
      note TEXT,
      last_online DATETIME,
      created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_ip_status ON ip_assignments(status)
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS devices (
      mac VARCHAR(17) PRIMARY KEY,
      vendor VARCHAR(100),
      hostname VARCHAR(255),
      first_seen DATETIME,
      last_seen DATETIME
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address VARCHAR(15) NOT NULL,
      mac_addresses TEXT NOT NULL,
      detected_at DATETIME NOT NULL,
      last_detected DATETIME NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at DATETIME,
      resolution_note TEXT
    )
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_conflict_ip ON conflicts(ip_address)
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user VARCHAR(50) NOT NULL,
      action VARCHAR(20) NOT NULL,
      ip_address VARCHAR(15),
      details TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_log_created_at ON audit_log(created_at)
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS oui (
      oui VARCHAR(6) PRIMARY KEY,
      vendor VARCHAR(100) NOT NULL
    )
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS network_diag_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT,
      generated_at DATETIME,
      hostname TEXT,
      platform TEXT,
      proxy TEXT,
      tests_json TEXT,
      hints_json TEXT,
      routes_json TEXT,
      gateways_json TEXT,
      adapters_json TEXT,
      interfaces_json TEXT,
      text_report TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_network_diag_created_at ON network_diag_reports(created_at DESC)
  `);
}

async function testDatabaseConnection() {
  try {
    await sequelize.authenticate();
    return { ok: true, message: "Database connected" };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

module.exports = {
  sequelize,
  initDatabase,
  testDatabaseConnection,
};
