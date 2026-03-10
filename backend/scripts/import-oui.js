const https = require("https");
const { parse } = require("csv-parse/sync");
const { sequelize, initDatabase } = require("../src/config/database");

const OUI_CSV_URLS = [
  "https://standards-oui.ieee.org/oui/oui.csv",
  "https://raw.githubusercontent.com/wkz/ieee-oui/master/oui.csv",
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch OUI CSV, status=${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("Fetch timeout"));
    });
  });
}

function pickField(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
      return String(row[key]).trim();
    }
  }
  return "";
}

async function main() {
  await initDatabase();

  console.log("Downloading OUI list...");
  let csvText = "";
  for (const url of OUI_CSV_URLS) {
    try {
      csvText = await fetchText(url);
      if (csvText) {
        console.log(`Using source: ${url}`);
        break;
      }
    } catch (error) {
      console.log(`Skip source: ${url} (${error.message})`);
    }
  }
  if (!csvText) {
    throw new Error("No available OUI source");
  }
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
  });

  const values = records
    .map((row) => {
      const rawOui = pickField(row, ["Assignment", "oui", "OUI", "macPrefix", "registryAssignment"]);
      const rawVendor = pickField(row, ["Organization Name", "organizationName", "companyName", "vendor", "name"]);
      const hex = rawOui.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
      const vendor = rawVendor;
      if (hex.length !== 6 || !vendor) return null;
      return { oui: hex, vendor };
    })
    .filter(Boolean);

  console.log(`Parsed rows: ${values.length}`);
  const tx = await sequelize.transaction();
  try {
    const chunkSize = 500;
    for (let i = 0; i < values.length; i += chunkSize) {
      const chunk = values.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "(?, ?)").join(",");
      const bindings = chunk.flatMap((v) => [v.oui, v.vendor]);
      await sequelize.query(
        `INSERT OR REPLACE INTO oui (oui, vendor) VALUES ${placeholders}`,
        { bind: bindings, transaction: tx }
      );
      if ((i / chunkSize) % 20 === 0) {
        console.log(`Imported ${Math.min(i + chunk.length, values.length)} / ${values.length}`);
      }
    }
    await tx.commit();
    console.log("OUI import completed.");
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await sequelize.close();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await sequelize.close();
  } catch (e) {
    // ignore close errors
  }
  process.exit(1);
});
