const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = __dirname;
const envFile = path.join(root, ".env");

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const dataFile = path.join(root, "data", "content.json");
const votesFile = path.join(root, "data", "votes.json");
const messagesFile = path.join(root, "data", "messages.json");
const uploadsDir = path.join(root, "uploads");
const port = Number(process.env.PORT || 4177);
const adminPassword = process.env.ADMIN_PASSWORD || "change-this-password";
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const isProduction = process.env.NODE_ENV === "production";
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || "dis-media";
const cloudStorageEnabled = Boolean(supabaseUrl && supabaseKey) && (isProduction || process.env.USE_SUPABASE_LOCAL === "true");
const oneDay = 60 * 60 * 24;
const oneYear = oneDay * 365;
const messageRateLimits = new Map();

if (isProduction && adminPassword === "change-this-password") {
  throw new Error("ADMIN_PASSWORD must be configured in production.");
}

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production.");
}

if (isProduction && !cloudStorageEnabled) {
  throw new Error("Supabase persistence must be configured in production.");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};

const uploadTypes = {
  "image/gif": { extension: ".gif", type: "image" },
  "image/jpeg": { extension: ".jpg", type: "image" },
  "image/png": { extension: ".png", type: "image" },
  "image/webp": { extension: ".webp", type: "image" },
  "video/mp4": { extension: ".mp4", type: "video" },
  "video/quicktime": { extension: ".mov", type: "video" },
  "video/webm": { extension: ".webm", type: "video" }
};

fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(votesFile)) fs.writeFileSync(votesFile, '{"polls":{}}\n');
if (!fs.existsSync(messagesFile)) fs.writeFileSync(messagesFile, "[]\n");

function supabaseHeaders(extra = {}) {
  const headers = { apikey: supabaseKey, ...extra };
  if (!supabaseKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${supabaseKey}`;
  return headers;
}

async function readContent() {
  return readJsonFile(dataFile, {}, "content");
}

async function writeContent(content) {
  await writeJsonFile(dataFile, content, "content");
  const storedVotes = await readJsonFile(votesFile, { polls: {} });
  const validPollIds = new Set((content.polls || []).map((poll) => poll.id));
  const nextPolls = Object.fromEntries(Object.entries(storedVotes.polls || {}).filter(([pollId]) => validPollIds.has(pollId)));
  if (Object.keys(nextPolls).length !== Object.keys(storedVotes.polls || {}).length) {
    await writeJsonFile(votesFile, { ...storedVotes, polls: nextPolls });
  }
}

async function readJsonFile(file, fallback, storageKey = path.basename(file, ".json")) {
  if (cloudStorageEnabled) {
    const response = await fetch(`${supabaseUrl}/rest/v1/app_state?key=eq.${encodeURIComponent(storageKey)}&select=value`, {
      headers: supabaseHeaders({ Accept: "application/json" })
    });
    if (!response.ok) throw new Error(`Cloud read failed (${response.status})`);
    const rows = await response.json();
    if (rows[0]?.value !== undefined) return rows[0].value;
    const initialValue = readLocalJson(file, fallback);
    await writeJsonFile(file, initialValue, storageKey);
    return initialValue;
  }
  return readLocalJson(file, fallback);
}

function readLocalJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

async function writeJsonFile(file, value, storageKey = path.basename(file, ".json")) {
  if (cloudStorageEnabled) {
    const response = await fetch(`${supabaseUrl}/rest/v1/app_state?on_conflict=key`, {
      method: "POST",
      headers: supabaseHeaders({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify([{ key: storageKey, value }])
    });
    if (!response.ok) throw new Error(`Cloud write failed (${response.status})`);
    return;
  }
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function readBuffer(request, limit = 25_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > limit) {
        request.destroy();
        reject(new Error("Upload too large"));
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
}

function parseMultipartFile(request, buffer) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) throw new Error("Missing multipart boundary");

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(buffer, boundaryBuffer);
  for (const rawPart of parts) {
    let part = rawPart;
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(0, 2).toString() === "--") continue;

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headers = part.subarray(0, headerEnd).toString("utf8");
    const contentDisposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
    const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1];
    if (!filename) continue;

    const mime = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || "";
    let content = part.subarray(headerEnd + 4);
    if (content.subarray(-2).toString() === "\r\n") content = content.subarray(0, -2);

    return { content, filename, mime };
  }

  throw new Error("No file in upload");
}

async function saveUpload(file) {
  const uploadType = uploadTypes[file.mime];
  if (!uploadType) throw new Error("Unsupported file type");

  const safeName = path
    .basename(file.filename, path.extname(file.filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `${Date.now()}-${id}-${safeName || "upload"}${uploadType.extension}`;
  let url = `/uploads/${filename}`;
  if (cloudStorageEnabled) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(supabaseBucket)}/${encodeURIComponent(filename)}`, {
      method: "POST",
      headers: supabaseHeaders({ "Content-Type": file.mime, "cache-control": "3600", "x-upsert": "false" }),
      body: file.content
    });
    if (!response.ok) throw new Error(`Cloud upload failed (${response.status})`);
    url = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseBucket)}/${encodeURIComponent(filename)}`;
  } else {
    fs.writeFileSync(path.join(uploadsDir, filename), file.content);
  }

  return {
    filename,
    name: file.filename,
    type: uploadType.type,
    url,
    createdAt: new Date().toISOString()
  };
}

async function deleteUpload(filename) {
  if (cloudStorageEnabled) {
    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseBucket)}/`;
    const safeName = path.basename(String(filename || "").startsWith(publicPrefix) ? decodeURIComponent(String(filename).slice(publicPrefix.length)) : String(filename || ""));
    if (!safeName) throw new Error("Invalid upload filename");
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(supabaseBucket)}/${encodeURIComponent(safeName)}`, {
      method: "DELETE",
      headers: supabaseHeaders()
    });
    if (!response.ok && response.status !== 404) throw new Error(`Cloud delete failed (${response.status})`);
    return { ok: true };
  }
  const safeName = path.basename(filename || "");
  if (!safeName) throw new Error("Missing filename");
  const filePath = path.join(uploadsDir, safeName);
  const relativePath = path.relative(uploadsDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) throw new Error("Invalid filename");
  const existed = fs.existsSync(filePath);
  if (existed) fs.unlinkSync(filePath);
  return { filename: safeName, deleted: existed };
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, headers);
  response.end(body);
}

function sendJson(response, status, payload, headers = {}) {
  send(response, status, JSON.stringify(payload), { "Content-Type": "application/json; charset=utf-8", ...headers });
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((part) => part.length === 2)
  );
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
}

function makeSession() {
  const value = `${Date.now()}.${crypto.randomBytes(18).toString("hex")}`;
  return `${value}.${sign(value)}`;
}

function makeVoterToken() {
  const value = crypto.randomBytes(24).toString("hex");
  return `${value}.${sign(value)}`;
}

function getVoterToken(request) {
  const token = parseCookies(request).dis_voter || "";
  const [value, signature] = token.split(".");
  if (!value || !signature) return "";
  const expected = sign(value);
  if (expected.length !== signature.length) return "";
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) ? token : "";
}

function voterHash(token, pollId) {
  return crypto.createHash("sha256").update(`${token}:${pollId}:${sessionSecret}`).digest("hex");
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();
}

async function voteState(request, token) {
  const content = await readContent();
  const stored = await readJsonFile(votesFile, { polls: {} });
  return (content.polls || []).map((poll) => {
    const pollStore = stored.polls?.[poll.id] || { counts: {}, voters: {} };
    const hash = voterHash(token, poll.id);
    const counts = Object.fromEntries((poll.options || []).map((option) => [option.id, Number(pollStore.counts?.[option.id]) || 0]));
    return {
      id: poll.id,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      votedOption: pollStore.voters?.[hash] || ""
    };
  });
}

function normalizeMessage(payload = {}) {
  const type = ["idea", "general", "partner"].includes(payload.type) ? payload.type : "general";
  const name = String(payload.name || "").trim().slice(0, 100);
  const email = String(payload.email || "").trim().slice(0, 180);
  const subject = String(payload.subject || "").trim().slice(0, 180);
  const message = String(payload.message || "").trim().slice(0, 5000);
  const company = String(payload.company || "").trim().slice(0, 180);
  const budget = String(payload.budget || "").trim().slice(0, 120);
  if (!name || !message) throw new Error("Името и съобщението са задължителни.");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Невалиден имейл адрес.");
  return { type, name, email, subject, message, company, budget };
}

function isAuthenticated(request) {
  const token = parseCookies(request).dis_session;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const value = `${parts[0]}.${parts[1]}`;
  const expected = sign(value);
  const provided = parts[2];
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function safePath(urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(root, cleanPath));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

function loginPage(error = "") {
  return `<!doctype html>
    <html lang="bg">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>D.I.S Admin Login</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/styles.css?v=20260713-2" />
      </head>
      <body class="admin-body">
        <main class="login-shell">
          <form class="login-card" method="post" action="/login">
            <img src="/assets/dis-logo.png" alt="D.I.S Подкаст" />
            <h1>Админ вход</h1>
            <p>Само за хората, които поддържат сайта.</p>
            <label class="mini-field">
              <span>Парола</span>
              <input name="password" type="password" autocomplete="current-password" required />
            </label>
            ${error ? `<p class="login-error">${error}</p>` : ""}
            <div class="login-actions">
              <button class="button primary" type="submit">Влез</button>
              <a class="button secondary" href="/">Обратно към сайта</a>
            </div>
          </form>
        </main>
      </body>
    </html>`;
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/content" && request.method === "GET") {
    return sendJson(response, 200, await readContent());
  }

  if (url.pathname === "/api/content" && request.method === "PUT") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const nextContent = JSON.parse(await readBody(request));
    await writeContent(nextContent);
    return sendJson(response, 200, nextContent);
  }

  if (url.pathname === "/api/votes" && request.method === "GET") {
    const existingToken = getVoterToken(request);
    const token = existingToken || makeVoterToken();
    return sendJson(response, 200, { polls: await voteState(request, token) }, existingToken ? {} : {
      "Set-Cookie": `dis_voter=${token}; HttpOnly; SameSite=Lax; Max-Age=${oneYear}; Path=/`
    });
  }

  const voteMatch = url.pathname.match(/^\/api\/votes\/([^/]+)$/);
  if (voteMatch && request.method === "POST") {
    const existingToken = getVoterToken(request);
    const token = existingToken || makeVoterToken();
    const pollId = decodeURIComponent(voteMatch[1]);
    const payload = JSON.parse(await readBody(request));
    const content = await readContent();
    const poll = (content.polls || []).find((item) => item.id === pollId);
    if (!poll || poll.status !== "active") return sendJson(response, 404, { error: "Това гласуване не е активно." });
    if (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now()) return sendJson(response, 409, { error: "Гласуването е приключило." });
    const option = (poll.options || []).find((item) => item.id === payload.optionId);
    if (!option) return sendJson(response, 400, { error: "Невалиден избор." });

    const stored = await readJsonFile(votesFile, { polls: {} });
    stored.polls ||= {};
    stored.polls[pollId] ||= { counts: {}, voters: {} };
    const hash = voterHash(token, pollId);
    if (stored.polls[pollId].voters[hash]) {
      return sendJson(response, 409, { error: "Вече си гласувал в тази анкета.", polls: await voteState(request, token) });
    }
    stored.polls[pollId].voters[hash] = option.id;
    stored.polls[pollId].counts[option.id] = (Number(stored.polls[pollId].counts[option.id]) || 0) + 1;
    await writeJsonFile(votesFile, stored);
    return sendJson(response, 200, { polls: await voteState(request, token) }, existingToken ? {} : {
      "Set-Cookie": `dis_voter=${token}; HttpOnly; SameSite=Lax; Max-Age=${oneYear}; Path=/`
    });
  }

  if (url.pathname === "/health" && request.method === "GET") {
    return sendJson(response, 200, { ok: true, storage: cloudStorageEnabled ? "supabase" : "local" });
  }

  if (url.pathname === "/api/messages" && request.method === "POST") {
    const payload = JSON.parse(await readBody(request));
    if (payload.website) return sendJson(response, 200, { ok: true });
    const ipKey = crypto.createHash("sha256").update(`${clientIp(request)}:${sessionSecret}`).digest("hex");
    const recent = (messageRateLimits.get(ipKey) || []).filter((time) => Date.now() - time < 60 * 60 * 1000);
    if (recent.length >= 5) return sendJson(response, 429, { error: "Твърде много съобщения. Опитай отново по-късно." });
    recent.push(Date.now());
    messageRateLimits.set(ipKey, recent);
    const message = {
      id: crypto.randomUUID(),
      ...normalizeMessage(payload),
      status: "new",
      createdAt: new Date().toISOString()
    };
    const messages = await readJsonFile(messagesFile, []);
    messages.unshift(message);
    await writeJsonFile(messagesFile, messages);
    return sendJson(response, 201, { ok: true, id: message.id });
  }

  if (url.pathname === "/api/messages" && request.method === "GET") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    return sendJson(response, 200, await readJsonFile(messagesFile, []));
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (messageMatch && request.method === "PATCH") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const payload = JSON.parse(await readBody(request));
    const messages = await readJsonFile(messagesFile, []);
    const message = messages.find((item) => item.id === messageMatch[1]);
    if (!message) return sendJson(response, 404, { error: "Not found" });
    if (["new", "read", "in-progress", "done", "archived"].includes(payload.status)) message.status = payload.status;
    await writeJsonFile(messagesFile, messages);
    return sendJson(response, 200, message);
  }

  if (messageMatch && request.method === "DELETE") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const messages = await readJsonFile(messagesFile, []);
    await writeJsonFile(messagesFile, messages.filter((item) => item.id !== messageMatch[1]));
    return send(response, 204, "");
  }

  if (url.pathname === "/api/upload" && request.method === "POST") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const buffer = await readBuffer(request);
    const file = parseMultipartFile(request, buffer);
    return sendJson(response, 200, await saveUpload(file));
  }

  if (url.pathname === "/api/upload" && request.method === "DELETE") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    return sendJson(response, 200, await deleteUpload(url.searchParams.get("file")));
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return send(response, 204, "", {
      "Set-Cookie": "dis_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/"
    });
  }

  if (url.pathname === "/login" && request.method === "GET") {
    return send(response, 200, loginPage(), { "Content-Type": "text/html; charset=utf-8" });
  }

  if (url.pathname === "/login" && request.method === "POST") {
    const body = new URLSearchParams(await readBody(request));
    if (body.get("password") !== adminPassword) {
      return send(response, 401, loginPage("Грешна парола."), { "Content-Type": "text/html; charset=utf-8" });
    }

    return send(response, 302, "", {
      Location: "/admin",
      "Set-Cookie": `dis_session=${makeSession()}; HttpOnly; SameSite=Lax; Max-Age=${oneDay}; Path=/`
    });
  }

  if (url.pathname === "/admin" || url.pathname === "/admin.html") {
    if (!isAuthenticated(request)) return send(response, 302, "", { Location: "/login" });
    const adminPath = path.join(root, "admin.html");
    return send(response, 200, fs.readFileSync(adminPath), { "Content-Type": "text/html; charset=utf-8" });
  }

  if (url.pathname === "/admin.html" && !isAuthenticated(request)) {
    return send(response, 302, "", { Location: "/login" });
  }

  if (url.pathname === "/news") {
    const newsPath = path.join(root, "news.html");
    return send(response, 200, fs.readFileSync(newsPath), { "Content-Type": "text/html; charset=utf-8" });
  }

  const pageRoutes = {
    "/fan-zone": "fan-zone.html",
    "/hosts": "hosts.html",
    "/partners": "partners.html",
    "/contact": "contact.html"
  };
  if (pageRoutes[url.pathname]) {
    return send(response, 200, fs.readFileSync(path.join(root, pageRoutes[url.pathname])), { "Content-Type": "text/html; charset=utf-8" });
  }

  const filePath = safePath(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
  if (path.basename(filePath) === "server.js" || filePath.startsWith(path.join(root, "data")) || path.basename(filePath) === ".env") {
    return send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }

  const extension = path.extname(filePath);
  send(response, 200, fs.readFileSync(filePath), {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": filePath.startsWith(path.join(root, "assets"))
      ? "public, max-age=86400"
      : extension === ".css" || extension === ".js"
        ? "no-cache"
        : "no-cache"
  });
}

http
  .createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
  })
  .listen(port, () => {
    console.log(`D.I.S site running at http://127.0.0.1:${port}`);
  });
