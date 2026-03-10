const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
dotenv.config();

const env = {
  port: Number(process.env.PORT || 3001),
  db: {
    storage: process.env.DB_PATH || path.resolve(__dirname, "..", "..", "data", "ipscanner.db"),
  },
};

module.exports = env;
