const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env");

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

function headers(extra = {}) {
  const value = { apikey: supabaseKey, Accept: "application/json", ...extra };
  if (!supabaseKey.startsWith("sb_secret_")) value.Authorization = `Bearer ${supabaseKey}`;
  return value;
}

async function request(pathname, range = "") {
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    headers: headers(range ? { Range: range } : {})
  });
  if (!response.ok) throw new Error(`Backup read failed for ${pathname.split("?")[0]} (${response.status})`);
  return response.json();
}

async function allRows(table) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await request(`${table}?select=*`, `${offset}-${offset + pageSize - 1}`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const appState = await request("app_state?key=in.(content,predictionLeague)&select=key,value,updated_at");
  const tableNames = [
    "league_storage_meta",
    "league_definitions",
    "league_players",
    "league_matches",
    "league_predictions",
    "league_scoring_versions",
    "league_score_events",
    "league_career_rollups"
  ];
  const relational = {};
  try {
    for (const table of tableNames) relational[table] = await allRows(table);
  } catch (error) {
    if (!/\(404\)/.test(error.message)) throw error;
    relational.unavailable = true;
  }

  const payload = {
    format: "dis-prediction-league-backup-v2",
    createdAt: new Date().toISOString(),
    source: new URL(supabaseUrl).host,
    appState,
    relational
  };
  const json = Buffer.from(JSON.stringify(payload));
  const digest = crypto.createHash("sha256").update(json).digest("hex");
  const envelope = Buffer.from(JSON.stringify({ sha256: digest, payload }));
  const compressed = zlib.gzipSync(envelope, { level: 9 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(root, "backups");
  const filename = path.join(directory, `prediction-league-${stamp}.json.gz`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, compressed, { mode: 0o600 });
  console.log(`Prediction League backup created: ${filename}`);
  console.log(`Compressed size: ${(compressed.length / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`SHA-256: ${digest}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
