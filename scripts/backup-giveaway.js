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
  if (!response.ok) {
    const error = new Error(`Giveaway backup read failed for ${pathname.split("?")[0]} (${response.status})`);
    error.statusCode = response.status;
    throw error;
  }
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
  const legacyRows = await request("app_state?key=eq.giveawayEntries&select=key,value,updated_at");
  let relationalRows = [];
  let relationalUnavailable = false;
  try {
    relationalRows = await allRows("giveaway_entries");
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    relationalUnavailable = true;
  }

  const payload = {
    format: "dis-giveaway-backup-v1",
    createdAt: new Date().toISOString(),
    source: new URL(supabaseUrl).host,
    legacyRows,
    relationalRows,
    relationalUnavailable
  };
  const json = Buffer.from(JSON.stringify(payload));
  const digest = crypto.createHash("sha256").update(json).digest("hex");
  const envelope = Buffer.from(JSON.stringify({ sha256: digest, payload }));
  const compressed = zlib.gzipSync(envelope, { level: 9 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(root, "backups");
  const filename = path.join(directory, `giveaway-${stamp}.json.gz`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filename, compressed, { mode: 0o600 });
  console.log(`Giveaway backup created: ${filename}`);
  console.log(`Legacy entries: ${Array.isArray(legacyRows[0]?.value) ? legacyRows[0].value.length : 0}`);
  console.log(`Relational entries: ${relationalRows.length}`);
  console.log(`SHA-256: ${digest}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
