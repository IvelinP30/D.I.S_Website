const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const QRCode = require("qrcode");
const { sendMessageEmail } = require("./server/message-email");
const { readUtf8Body } = require("./server/request-body");
const { requestTheSportsDb, theSportsDbUsageSummary } = require("./server/the-sports-db");
const { synchronizeFootballContent } = require("./server/football-sync");
const {
  cachedTeamMediaSearch,
  normalizeTeamSearch,
  rememberTeamMediaSearch,
  rememberTeamsFromEvents,
  searchTeamMediaCatalog,
  theSportsDbTeamMedia
} = require("./server/team-media");
const {
  PRESS_NEWS_CACHE_VERSION,
  articleLooksLikeFootball,
  fetchPressNewsWithFallback,
  mergePressArticles,
  pressNewsCacheIsFresh
} = require("./server/press-news");
const { downloadPressNewsThumbnail, pressNewsImageFilename } = require("./server/press-news-image");
const { applyChoice, choiceState, pruneEngagementStore } = require("./server/engagement");
const { createGiveawayRelationalStorage } = require("./server/giveaway-relational-storage");
const { createLeagueRelationalStorage } = require("./server/league-relational-storage");
const {
  archiveDeletedLeagueMatches,
  buildLeagueStateFromAggregates,
  buildPredictionLeagueState,
  POINTS,
  createRecoveryCode,
  hashRecoveryCode,
  matchStatus,
  nicknameIsTaken,
  nicknameKey,
  normalizeLeagueCollection,
  normalizeLeagueId,
  normalizeLeagueStore,
  normalizeChampionPrediction,
  normalizeNickname,
  normalizePrediction,
  periodLabels,
  rotatePlayerRecoveryCode
} = require("./server/prediction-league");

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
const contentSeedFile = path.join(root, "data", "content.seed.json");
const votesFile = path.join(root, "data", "votes.json");
const messagesFile = path.join(root, "data", "messages.json");
const giveawayEntriesFile = path.join(root, "data", "giveaway-entries.json");
const predictionLeagueFile = path.join(root, "data", "prediction-league.json");
const teamMediaCacheFile = path.join(root, "data", "team-media-cache.json");
const pressNewsCacheFile = path.join(root, "data", "press-news-cache.json");
const uploadsDir = path.join(root, "uploads");
const port = Number(process.env.PORT || 4177);
const adminPassword = process.env.ADMIN_PASSWORD || "change-this-password";
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const isProduction = process.env.NODE_ENV === "production";
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || "dis-media";
const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
const messageEmailFrom = String(process.env.MESSAGE_EMAIL_FROM || "").trim();
const configuredGaMeasurementId = String(process.env.GA_MEASUREMENT_ID || "").trim().toUpperCase();
const gaMeasurementId = /^G-[A-Z0-9]+$/.test(configuredGaMeasurementId) ? configuredGaMeasurementId : "";
const footballSyncSecret = String(process.env.FOOTBALL_SYNC_SECRET || process.env.API_FOOTBALL_SYNC_SECRET || "").trim();
const newsdataApiKey = String(process.env.NEWSDATA_API_KEY || "").trim();
const pressNewsQuery = String(process.env.NEWSDATA_QUERY || "футбол").trim().slice(0, 100) || "футбол";
const pressNewsBulgarianQuery = String(process.env.NEWSDATA_BULGARIAN_QUERY || "Левски OR ЦСКА OR Лудогорец OR efbet лига OR национален отбор").trim().slice(0, 100);
const pressNewsLanguage = String(process.env.NEWSDATA_LANGUAGE || "bg").trim().toLowerCase().slice(0, 8) || "bg";
const pressNewsFetchLimit = Math.min(20, Math.max(10, Number(process.env.NEWSDATA_MAX_ITEMS || 20) || 20));
const cloudStorageEnabled = Boolean(supabaseUrl && supabaseKey) && (isProduction || process.env.USE_SUPABASE_LOCAL === "true");
const leagueStorageMode = ["auto", "legacy", "relational"].includes(String(process.env.LEAGUE_STORAGE_MODE || "").toLowerCase())
  ? String(process.env.LEAGUE_STORAGE_MODE).toLowerCase()
  : "auto";
const oneDay = 60 * 60 * 24;
const oneYear = oneDay * 365;
const leagueCookieLifetime = oneDay * 400;
const maxUploadBytes = 25_000_000;
const maxStoredImageBytes = 1_200_000;
const giveawayAttemptsPerHour = 30;
const messageAttemptsPerHour = 15;
const leagueIdentityAttemptsPerHour = 30;
const messageRateLimits = new Map();
const giveawayRateLimits = new Map();
const leagueIdentityRateLimits = new Map();
let predictionLeagueMutation = Promise.resolve();
let voteStoreMutation = Promise.resolve();
let sportsDataStateMutation = Promise.resolve();
let footballSyncMutation = Promise.resolve();
let pressNewsRefreshPromise = null;
let relationalLeagueFailure = null;

if (isProduction && adminPassword === "change-this-password") {
  throw new Error("ADMIN_PASSWORD must be configured in production.");
}

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production.");
}

if (isProduction && !cloudStorageEnabled) {
  throw new Error("Supabase persistence must be configured in production.");
}

if (isProduction && (!resendApiKey || !messageEmailFrom)) {
  throw new Error("RESEND_API_KEY and MESSAGE_EMAIL_FROM must be configured in production.");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
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
if (!fs.existsSync(giveawayEntriesFile)) fs.writeFileSync(giveawayEntriesFile, "[]\n");
if (!fs.existsSync(predictionLeagueFile)) fs.writeFileSync(predictionLeagueFile, '{"players":[],"predictions":[]}\n');
if (!fs.existsSync(teamMediaCacheFile)) fs.writeFileSync(teamMediaCacheFile, '{"searches":{}}\n');
if (!fs.existsSync(pressNewsCacheFile)) fs.writeFileSync(pressNewsCacheFile, '{"items":[],"refreshedAt":""}\n');

function supabaseHeaders(extra = {}) {
  const headers = { apikey: supabaseKey, ...extra };
  if (!supabaseKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${supabaseKey}`;
  return headers;
}

const relationalLeagueStorage = createLeagueRelationalStorage({
  enabled: cloudStorageEnabled && leagueStorageMode !== "legacy",
  url: supabaseUrl,
  requestHeaders: supabaseHeaders,
  logger: console
});

const relationalGiveawayStorage = createGiveawayRelationalStorage({
  enabled: cloudStorageEnabled,
  url: supabaseUrl,
  requestHeaders: supabaseHeaders,
  logger: console
});

async function readContent() {
  const seedContent = readLocalJson(contentSeedFile, {});
  if (!cloudStorageEnabled && !fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, `${JSON.stringify(seedContent, null, 2)}\n`);
    return seedContent;
  }
  return readJsonFile(dataFile, seedContent, "content");
}

async function writeContent(content) {
  const previousContent = await readContent();
  const relationalReady = await ensureRelationalLeagueStorage(previousContent);
  const relationalGiveawayReady = await ensureRelationalGiveawayStorage();
  if (!relationalReady) {
    await mutateLeagueStore((leagueStore) => {
      const archivedStore = archiveDeletedLeagueMatches(previousContent.predictionLeague, content.predictionLeague, leagueStore);
      leagueStore.players = archivedStore.players;
      leagueStore.predictions = archivedStore.predictions;
      leagueStore.seasonPredictions = archivedStore.seasonPredictions;
      leagueStore.archivedMatches = archivedStore.archivedMatches;
    });
  } else {
    await relationalLeagueStorage.prepareContent(content);
  }
  await writeJsonFile(dataFile, content, "content");
  if (relationalReady) {
    relationalLeagueStorage.ensureContent(content).catch((error) => {
      console.warn(`Deferred Prediction League cleanup will retry automatically: ${error.message}`);
    });
  }
  const storedVotes = await readJsonFile(votesFile, { polls: {} });
  const nextVotes = pruneEngagementStore(storedVotes, {
    pollIds: (content.polls || []).map((poll) => poll.id),
    newsIds: (content.news || []).map((item, index) => newsItemSlug(item, index)),
    predictionIds: (content.predictions || []).map((prediction) => String(prediction.id || "")).filter(Boolean)
  });
  if (JSON.stringify(nextVotes) !== JSON.stringify(storedVotes)) await writeJsonFile(votesFile, nextVotes);
  const validGiveawayId = content.giveaway?.id || "";
  if (relationalGiveawayReady) {
    await relationalGiveawayStorage.keepOnlyGiveaway(validGiveawayId);
  } else {
    const entries = await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
    const nextEntries = validGiveawayId ? entries.filter((entry) => entry.giveawayId === validGiveawayId) : [];
    if (nextEntries.length !== entries.length) await writeJsonFile(giveawayEntriesFile, nextEntries, "giveawayEntries");
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

function withSportsDataState(operation) {
  const run = sportsDataStateMutation.then(async () => {
    const state = await readJsonFile(teamMediaCacheFile, { searches: {}, teams: {}, usage: {} }, "teamMediaCache");
    state.searches ||= {};
    state.teams ||= {};
    try {
      return await operation(state);
    } finally {
      await writeJsonFile(teamMediaCacheFile, state, "teamMediaCache");
    }
  });
  sportsDataStateMutation = run.catch(() => undefined);
  return run;
}

async function theSportsDbRequest(state, endpoint, parameters = {}) {
  const result = await requestTheSportsDb(endpoint, parameters, { state });
  if (result.events.length) rememberTeamsFromEvents(state, result.events);
  return result;
}

function queueFootballSync(options = {}) {
  const run = footballSyncMutation.then(async () => {
    const content = await readContent();
    const relationalReady = await ensureRelationalLeagueStorage(content);
    const archivedEventKeys = relationalReady
      ? await relationalLeagueStorage.archivedExternalEventKeys()
      : new Set((await readLeagueStore()).archivedMatches
        .filter((match) => Number.isInteger(Number(match.externalEventId)) && Number(match.externalEventId) > 0)
        .map((match) => `${normalizeLeagueId(match.leagueId)}:${Number(match.externalEventId)}`));
    let result;
    let usage;
    await withSportsDataState(async (state) => {
      result = await synchronizeFootballContent(content, {
        leagueId: String(options.leagueId || ""),
        round: Number(options.round) || undefined,
        forceSchedule: options.forceSchedule === true,
        archivedEventKeys,
        request: (endpoint, parameters) => theSportsDbRequest(state, endpoint, parameters)
      });
      usage = theSportsDbUsageSummary(state);
    });
    if (result.changed) await writeContent(result.content);
    return { ...result, usage };
  });
  footballSyncMutation = run.catch(() => undefined);
  return run;
}

function internalFootballSyncAuthorized(request) {
  if (!footballSyncSecret) return false;
  const authorization = String(request.headers.authorization || "");
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBuffer = Buffer.from(footballSyncSecret);
  const providedBuffer = Buffer.from(provided);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function footballSyncMessage(summary = {}) {
  const parts = [];
  if (summary.added) parts.push(`${summary.added} добавени`);
  if (summary.updated) parts.push(`${summary.updated} обновени`);
  if (summary.settled) parts.push(`${summary.settled} приключени`);
  if (summary.archived) parts.push(`${summary.archived} архивирани`);
  if (summary.advanced) parts.push(`преминаване към следващ кръг`);
  return parts.length ? parts.join(" · ") : summary.apiCalls ? "Кръгът е проверен. Няма нови или променени мачове." : "Няма активна TheSportsDB лига за синхронизиране.";
}

async function readPressNews() {
  const cache = await readJsonFile(pressNewsCacheFile, { items: [], refreshedAt: "" }, "pressNewsCache");
  const now = Date.now();
  const previousCachedItems = Array.isArray(cache.items) ? cache.items : [];
  const cachedItems = previousCachedItems.filter(articleLooksLikeFootball);
  const retainedItems = mergePressArticles(cachedItems, [], {
    now,
    limit: Number.POSITIVE_INFINITY,
    sortMode: "newest"
  }).map(withoutPressImageSource);
  const currentCache = { ...cache, items: retainedItems };
  if (JSON.stringify(retainedItems) !== JSON.stringify(previousCachedItems)) {
    await writeJsonFile(pressNewsCacheFile, currentCache, "pressNewsCache");
    await cleanupExpiredPressNewsImages(previousCachedItems, retainedItems);
  }
  if (pressNewsCacheIsFresh(currentCache, now)) {
    return { items: retainedItems, refreshedAt: cache.refreshedAt, stale: false, configured: true };
  }

  if (!newsdataApiKey) {
    return {
      items: retainedItems,
      refreshedAt: cache.refreshedAt || "",
      stale: Boolean(retainedItems.length),
      configured: false
    };
  }

  if (!pressNewsRefreshPromise) {
    pressNewsRefreshPromise = (async () => {
      const fetchedItems = await fetchPressNewsWithFallback({
        apiKey: newsdataApiKey,
        queries: [pressNewsBulgarianQuery, pressNewsQuery],
        language: pressNewsLanguage,
        limit: pressNewsFetchLimit,
        now
      });
      const fetchedWithImages = await cachePressNewsImages(fetchedItems, retainedItems);
      const retainedWithNewItems = mergePressArticles(retainedItems, fetchedWithImages, {
        now,
        limit: Number.POSITIVE_INFINITY,
        sortMode: "newest"
      }).map(withoutPressImageSource);
      const nextCache = {
        version: PRESS_NEWS_CACHE_VERSION,
        items: retainedWithNewItems,
        refreshedAt: new Date(now).toISOString()
      };
      await writeJsonFile(pressNewsCacheFile, nextCache, "pressNewsCache");
      return nextCache;
    })().finally(() => {
      pressNewsRefreshPromise = null;
    });
  }

  try {
    const refreshed = await pressNewsRefreshPromise;
    return { ...refreshed, stale: false, configured: true };
  } catch (error) {
    if (retainedItems.length) {
      return { items: retainedItems, refreshedAt: cache.refreshedAt || "", stale: true, configured: true };
    }
    throw error;
  }
}

function externalNewsErrorMessage(error) {
  return String(error?.message || "Unknown NewsData error")
    .replace(/pub_[a-z0-9]+/gi, "[redacted-api-key]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 300);
}

function readBody(request) {
  return readUtf8Body(request, 1_000_000);
}

function readBuffer(request, limit = maxUploadBytes) {
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
  if (uploadType.type === "image" && file.content.length > maxStoredImageBytes) {
    throw new Error("Image is larger than the allowed 1.2 MB after optimization");
  }

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

function pressNewsThumbnailUrl(filename) {
  return cloudStorageEnabled
    ? `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseBucket)}/${encodeURIComponent(filename)}`
    : `/uploads/${filename}`;
}

async function pressNewsThumbnailExists(filename) {
  if (!cloudStorageEnabled) return fs.existsSync(path.join(uploadsDir, filename));
  try {
    const response = await fetch(pressNewsThumbnailUrl(filename), { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function storePressNewsThumbnail(filename, content) {
  if (cloudStorageEnabled) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(supabaseBucket)}/${encodeURIComponent(filename)}`, {
      method: "POST",
      headers: supabaseHeaders({ "Content-Type": "image/webp", "cache-control": "259200", "x-upsert": "true" }),
      body: content
    });
    if (!response.ok) throw new Error(`Cloud thumbnail upload failed (${response.status})`);
  } else {
    fs.writeFileSync(path.join(uploadsDir, filename), content);
  }
  return pressNewsThumbnailUrl(filename);
}

function withoutPressImageSource(item = {}) {
  const cleanItem = { ...item };
  delete cleanItem.imageSourceUrl;
  return cleanItem;
}

async function cachePressNewsImages(items = [], retainedItems = []) {
  const retainedByUrl = new Map(retainedItems.map((item) => [item.articleUrl, item]));
  const pendingItems = items.map((item) => ({ ...item }));
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < pendingItems.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = pendingItems[index];
      const retainedImageUrl = retainedByUrl.get(item.articleUrl)?.imageUrl || "";
      if (retainedImageUrl) {
        item.imageUrl = retainedImageUrl;
        pendingItems[index] = withoutPressImageSource(item);
        continue;
      }
      if (!item.imageSourceUrl) {
        pendingItems[index] = withoutPressImageSource(item);
        continue;
      }
      try {
        const filename = pressNewsImageFilename(item.imageSourceUrl);
        const cachedUrl = pressNewsThumbnailUrl(filename);
        if (await pressNewsThumbnailExists(filename)) {
          item.imageUrl = cachedUrl;
        } else {
          const thumbnail = await downloadPressNewsThumbnail({ sourceUrl: item.imageSourceUrl });
          item.imageUrl = await storePressNewsThumbnail(filename, thumbnail);
        }
      } catch (error) {
        console.warn(`Press thumbnail skipped for ${String(item.id || "unknown").slice(0, 80)}: ${externalNewsErrorMessage(error)}`);
      }
      pendingItems[index] = withoutPressImageSource(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pendingItems.length) }, () => worker()));
  return pendingItems;
}

async function cleanupExpiredPressNewsImages(previousItems = [], retainedItems = []) {
  const retainedUrls = new Set(retainedItems.map((item) => item.imageUrl).filter(Boolean));
  const expiredUrls = [...new Set(previousItems.map((item) => item.imageUrl).filter((url) => url && !retainedUrls.has(url)))];
  await Promise.allSettled(expiredUrls.map((url) => deleteUpload(url)));
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

function voterCookieHeader(token) {
  return `dis_voter=${token}; HttpOnly; SameSite=Lax; Max-Age=${oneYear}; Path=/${isProduction ? "; Secure" : ""}`;
}

async function mutateVoteStore(mutator) {
  const operation = voteStoreMutation.then(async () => {
    const store = await readJsonFile(votesFile, { polls: {}, newsReactions: {}, predictionVotes: {} });
    const result = await mutator(store);
    await writeJsonFile(votesFile, store);
    return { store, result };
  });
  voteStoreMutation = operation.catch(() => undefined);
  return operation;
}

function leagueCookieValue(playerId) {
  return `${playerId}.${sign(`league:${playerId}`)}`;
}

function leagueCookieHeader(playerId) {
  return `dis_league=${leagueCookieValue(playerId)}; HttpOnly; SameSite=Lax; Max-Age=${leagueCookieLifetime}; Path=/${isProduction ? "; Secure" : ""}`;
}

function getLeaguePlayerId(request) {
  const token = parseCookies(request).dis_league || "";
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return "";
  const playerId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(`league:${playerId}`);
  if (expected.length !== signature.length) return "";
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) ? playerId : "";
}

async function readLeagueStore() {
  return readLegacyLeagueStore();
}

async function readLegacyLeagueStore() {
  return normalizeLeagueStore(await readJsonFile(predictionLeagueFile, { players: [], predictions: [] }, "predictionLeague"));
}

async function ensureRelationalGiveawayStorage() {
  if (!cloudStorageEnabled) return false;
  return relationalGiveawayStorage.probe();
}

async function ensureRelationalLeagueStorage(content = null) {
  if (!cloudStorageEnabled || leagueStorageMode === "legacy") return false;
  if (relationalLeagueFailure && Date.now() - relationalLeagueFailure.at < 5 * 60 * 1000) {
    if (leagueStorageMode === "relational") throw relationalLeagueFailure.error;
    return false;
  }
  const currentContent = content || await readContent();
  try {
    const ready = await relationalLeagueStorage.ensureReady(currentContent, readLegacyLeagueStore);
    relationalLeagueFailure = null;
    if (!ready && leagueStorageMode === "relational") {
      throw new Error("LEAGUE_STORAGE_MODE requires the relational Supabase schema, but it is unavailable.");
    }
    return ready;
  } catch (error) {
    relationalLeagueFailure = { at: Date.now(), error };
    if (leagueStorageMode === "relational") throw error;
    console.warn(`Prediction League remains on the safe legacy store: ${error.message}`);
    return false;
  }
}

async function mutateLeagueStore(mutator) {
  const operation = predictionLeagueMutation.then(async () => {
    const store = await readLeagueStore();
    const result = await mutator(store);
    await writeJsonFile(predictionLeagueFile, store, "predictionLeague");
    return { store, result };
  });
  predictionLeagueMutation = operation.catch(() => undefined);
  return operation;
}

function requestedLeagueId(request) {
  try {
    return new URL(request.url, `http://${request.headers.host}`).searchParams.get("league") || "";
  } catch {
    return "";
  }
}

async function leagueState(request, storeOverride = null, playerIdOverride = null, leagueIdOverride = null) {
  const content = await readContent();
  if (storeOverride === null && await ensureRelationalLeagueStorage(content)) {
    const collection = normalizeLeagueCollection(content.predictionLeague);
    const visibleLeagues = collection.enabled ? collection.leagues.filter((league) => league.enabled) : [];
    const requestedId = normalizeLeagueId(
      leagueIdOverride === null ? requestedLeagueId(request) : leagueIdOverride,
      visibleLeagues[0]?.id || "general"
    );
    const selectedLeague = visibleLeagues.find((league) => league.id === requestedId) || visibleLeagues[0] || null;
    const requestedPlayerId = playerIdOverride === null ? getLeaguePlayerId(request) : playerIdOverride;
    const currentPlayer = requestedPlayerId ? await relationalLeagueStorage.player(requestedPlayerId) : null;
    const playerId = currentPlayer?.id || "";
    if (!selectedLeague) {
      return {
        enabled: false,
        hubTitle: collection.title,
        hubDescription: collection.description,
        leagues: [],
        selectedLeagueId: "",
        me: currentPlayer ? { nickname: currentPlayer.nickname } : null,
        matches: [],
        leaderboards: { week: [], month: [], season: [] },
        points: POINTS,
        periods: periodLabels()
      };
    }
    const data = await relationalLeagueStorage.stateData(content, playerId, selectedLeague.id);
    const state = buildLeagueStateFromAggregates(
      selectedLeague,
      data.aggregates,
      playerId,
      data.predictions,
      data.scoreEvents,
      Date.now(),
      { seasonPredictions: data.seasonPredictions, seasonMatches: data.seasonMatches }
    );
    return {
      ...state,
      hubTitle: collection.title,
      hubDescription: collection.description,
      leagues: visibleLeagues.map((league) => ({
        id: league.id,
        title: league.title,
        description: league.description,
        seasonLabel: league.seasonLabel,
        matchCount: league.matches.length,
        openMatchCount: league.matches.filter((match) => matchStatus(match) === "open").length,
        participating: Boolean(data.participation[league.id])
      })),
      selectedLeagueId: selectedLeague.id
    };
  }
  const store = storeOverride || await readLeagueStore();
  const requestedPlayerId = playerIdOverride === null ? getLeaguePlayerId(request) : playerIdOverride;
  const playerId = store.players.some((player) => player.id === requestedPlayerId) ? requestedPlayerId : "";
  const leagueId = leagueIdOverride === null ? requestedLeagueId(request) : leagueIdOverride;
  return buildPredictionLeagueState(content.predictionLeague, store, playerId, leagueId);
}

function safeRecoveryMatch(player, recoveryHash) {
  const stored = String(player.recoveryHash || "");
  if (stored.length !== recoveryHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(recoveryHash));
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function leagueIdentityRateLimited(request) {
  const ipKey = crypto.createHash("sha256").update(`league:${clientIp(request)}:${sessionSecret}`).digest("hex");
  const recent = (leagueIdentityRateLimits.get(ipKey) || []).filter((time) => Date.now() - time < 60 * 60 * 1000);
  if (recent.length >= leagueIdentityAttemptsPerHour) return true;
  recent.push(Date.now());
  leagueIdentityRateLimits.set(ipKey, recent);
  return false;
}

async function voteState(request, token) {
  const content = await readContent();
  const stored = await readJsonFile(votesFile, { polls: {} });
  return (content.polls || []).map((poll) => {
    const pollStore = stored.polls?.[poll.id] || { counts: {}, voters: {} };
    const hash = token ? voterHash(token, poll.id) : "";
    const counts = Object.fromEntries((poll.options || []).map((option) => [option.id, Number(pollStore.counts?.[option.id]) || 0]));
    return {
      id: poll.id,
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      votedOption: hash ? pollStore.voters?.[hash] || "" : ""
    };
  });
}

async function engagementState(token, contentOverride = null, storeOverride = null) {
  const content = contentOverride || await readContent();
  const stored = storeOverride || await readJsonFile(votesFile, { polls: {}, newsReactions: {}, predictionVotes: {} });
  const newsChoices = ["top", "analysis", "controversial", "more"];
  const predictionChoices = ["agree", "disagree"];
  const news = Object.fromEntries((content.news || []).map((item, index) => {
    const id = newsItemSlug(item, index);
    const voterKey = token ? voterHash(token, `news:${id}`) : "";
    return [id, choiceState(stored.newsReactions?.[id], newsChoices, voterKey)];
  }));
  const predictions = Object.fromEntries((content.predictions || []).flatMap((prediction) => {
    const id = String(prediction.id || "");
    const voterKey = token && id ? voterHash(token, `prediction:${id}`) : "";
    return id ? [[id, choiceState(stored.predictionVotes?.[id], predictionChoices, voterKey)]] : [];
  }));
  return { news, predictions };
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

async function notifyAboutMessage(message) {
  if (!isProduction) return;
  try {
    const content = await readContent();
    const result = await sendMessageEmail({
      message,
      content,
      apiKey: resendApiKey,
      from: messageEmailFrom
    });
    console.log(`[message-email] Sent notification for ${message.id}${result.id ? ` (${result.id})` : ""}.`);
  } catch (error) {
    const reason = error?.name === "AbortError" ? "Email provider timeout." : error.message;
    console.error(`[message-email] Notification failed for ${message.id}: ${reason}`);
  }
}

function giveawayIsOpen(giveaway = {}) {
  const now = Date.now();
  const startsAt = giveaway.startsAt ? new Date(giveaway.startsAt).getTime() : 0;
  const endsAt = giveaway.endsAt ? new Date(giveaway.endsAt).getTime() : Infinity;
  return Boolean(giveaway.id && giveaway.enabled && startsAt <= now && now < endsAt);
}

function getGiveawayToken(request) {
  const token = parseCookies(request).dis_giveaway || "";
  const [value, signature] = token.split(".");
  if (!value || !signature) return "";
  const expected = sign(value);
  if (expected.length !== signature.length) return "";
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) ? token : "";
}

function giveawayHash(value, giveawayId, purpose) {
  return crypto.createHmac("sha256", sessionSecret).update(`${purpose}:${giveawayId}:${value}`).digest("hex");
}

function normalizeGiveawayEntry(payload = {}, giveaway = {}, token = "") {
  const name = String(payload.name || "").trim().slice(0, 100);
  const email = String(payload.email || "").trim().toLowerCase().slice(0, 180);
  const socialHandle = String(payload.socialHandle || "").trim().slice(0, 180);
  const minAge = Number(giveaway.minAge);
  const hasMinAge = giveaway.minAge !== null && giveaway.minAge !== "" && Number.isFinite(minAge) && minAge > 0;
  const hasRegion = Boolean(String(giveaway.region || "").trim());
  if (!name || !email) throw new Error("Името и имейлът са задължителни.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Въведи валиден имейл адрес.");
  if (giveaway.socialHandleRequired && !socialHandle) throw new Error("Добави профила си в социална мрежа.");
  if ((hasMinAge || hasRegion) && !payload.ageConfirmed) throw new Error("Потвърди условията за възраст и територия.");
  if (!payload.rulesAccepted) throw new Error("Приеми официалните условия за участие.");
  if (giveaway.requirements?.length && !payload.requirementsConfirmed) throw new Error("Потвърди, че си изпълнил/а условията за участие.");
  return {
    name,
    email,
    socialHandle,
    emailHash: giveawayHash(email, giveaway.id, "email"),
    browserHash: giveawayHash(token, giveaway.id, "browser"),
    rulesHash: crypto.createHash("sha256").update(JSON.stringify({
      requirements: giveaway.requirements || [],
      officialRules: giveaway.officialRules || "",
      privacyNotice: giveaway.privacyNotice || "",
      prizes: giveaway.prizes || [],
      minAge: giveaway.minAge || 0,
      region: giveaway.region || "",
      socialHandleRequired: Boolean(giveaway.socialHandleRequired)
    })).digest("hex")
  };
}

function publicGiveawayEntry(entry) {
  const { emailHash, browserHash, ...safeEntry } = entry;
  return safeEntry;
}

function giveawayPrizeSlots(giveaway = {}) {
  const configuredPrizes = Array.isArray(giveaway.prizes)
    ? giveaway.prizes
        .filter((prize) => String(prize?.name || "").trim())
        .map((prize, index) => ({
          id: String(prize.id || `prize-${index + 1}`),
          name: String(prize.name).trim().slice(0, 180),
          image: String(prize.image || "").trim(),
          quantity: Math.max(1, Math.min(20, Number(prize.quantity) || 1))
        }))
    : [];
  const prizes = configuredPrizes.length
    ? configuredPrizes
    : [{
        id: "legacy-prize",
        name: String(giveaway.prize || "Футболна награда").trim().slice(0, 180),
        image: "",
        quantity: Math.max(1, Math.min(20, Number(giveaway.winnerCount) || 1))
      }];

  return prizes
    .flatMap((prize) => Array.from({ length: prize.quantity }, () => ({ id: prize.id, name: prize.name, image: prize.image })))
    .slice(0, 20);
}

function drawRandomEntries(entries, count) {
  const pool = [...entries];
  for (let index = 0; index < Math.min(count, pool.length); index += 1) {
    const randomIndex = crypto.randomInt(index, pool.length);
    [pool[index], pool[randomIndex]] = [pool[randomIndex], pool[index]];
  }
  return pool.slice(0, Math.min(count, pool.length));
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

function newsItemSlug(item = {}, index = 0) {
  const explicit = String(item.slug || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  if (explicit) return explicit;
  const title = String(item.title || "news")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52) || "news";
  const dateSuffix = String(item.createdAt || "").replace(/\D/g, "").slice(0, 12) || index + 1;
  return `${title}-${dateSuffix}`;
}

function compactPlainText(value = "", maxLength = 180) {
  const clean = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}…` : clean;
}

function escapeHtmlAttribute(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function absolutePublicUrl(value = "", fallback = "/assets/news-football-hero.png") {
  try {
    return new URL(value || fallback, "https://dis-podcast.onrender.com").href;
  } catch {
    return new URL(fallback, "https://dis-podcast.onrender.com").href;
  }
}

function publicImageMimeType(value = "") {
  const extension = path.extname(String(value).split(/[?#]/)[0]).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[extension] || "image/png";
}

function shareQrTarget(value = "") {
  try {
    const target = new URL(String(value || "/"), "https://dis-podcast.onrender.com");
    const allowed = target.origin === "https://dis-podcast.onrender.com" && (
      target.pathname === "/" ||
      target.pathname === "/news" ||
      target.pathname.startsWith("/news/") ||
      target.pathname === "/fan-zone"
    );
    return allowed ? target.href : "";
  } catch {
    return "";
  }
}

function renderNewsDetailHtml(item, index = 0) {
  const template = fs.readFileSync(path.join(root, "news-detail.html"), "utf8");
  const title = compactPlainText(item?.title || "Новина от D.I.S Подкаст", 120);
  const description = compactPlainText(item?.excerpt || item?.body || "Футболна новина от D.I.S Подкаст.", 180);
  const canonical = `https://dis-podcast.onrender.com/news/${encodeURIComponent(newsItemSlug(item, index))}`;
  const image = absolutePublicUrl(item?.imageUrl);
  const imageType = publicImageMimeType(image);
  return template
    .replaceAll("__NEWS_TITLE__", escapeHtmlAttribute(title))
    .replaceAll("__NEWS_DESCRIPTION__", escapeHtmlAttribute(description))
    .replaceAll("__NEWS_CANONICAL__", escapeHtmlAttribute(canonical))
    .replaceAll("__NEWS_IMAGE__", escapeHtmlAttribute(image))
    .replaceAll("__NEWS_IMAGE_TYPE__", escapeHtmlAttribute(imageType));
}

function renderSitemap(content = {}) {
  const staticPaths = ["/", "/news", "/fan-zone", "/hosts", "/partners", "/contact", "/privacy", "/cookies"];
  const urls = staticPaths.map((pathname) => ({ pathname, lastmod: "2026-07-20" }));
  (content.news || []).forEach((item, index) => {
    urls.push({
      pathname: `/news/${encodeURIComponent(newsItemSlug(item, index))}`,
      lastmod: /^\d{4}-\d{2}-\d{2}/.test(item.createdAt || "") ? item.createdAt.slice(0, 10) : "2026-07-20"
    });
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url><loc>${escapeHtmlAttribute(`https://dis-podcast.onrender.com${item.pathname}`)}</loc><lastmod>${item.lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`;
}

function loginPage(error = "") {
  return `<!doctype html>
    <html lang="bg">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>D.I.S Admin Login</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/client/css/styles.css?v=20260713-2" />
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

  if (url.pathname === "/analytics-config.js" && request.method === "GET") {
    return send(
      response,
      200,
      `window.DIS_ANALYTICS_CONFIG = ${JSON.stringify({ measurementId: gaMeasurementId })};`,
      { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" }
    );
  }

  if (url.pathname === "/api/content" && request.method === "GET") {
    return sendJson(response, 200, await readContent());
  }

  if (url.pathname === "/api/press-news" && request.method === "GET") {
    try {
      return sendJson(response, 200, await readPressNews(), {
        "Cache-Control": "public, max-age=900, stale-while-revalidate=3600"
      });
    } catch (error) {
      console.warn(`External-news endpoint failed: ${externalNewsErrorMessage(error)}`);
      return sendJson(response, 502, { error: "Външните новини временно не са достъпни." }, {
        "Cache-Control": "no-store, max-age=0"
      });
    }
  }

  if (url.pathname === "/api/share-qr" && request.method === "GET") {
    const target = shareQrTarget(url.searchParams.get("path"));
    if (!target) return sendJson(response, 400, { error: "Invalid share target" });
    const png = await QRCode.toBuffer(target, {
      type: "png",
      width: 384,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#050608", light: "#ffffff" }
    });
    return send(response, 200, png, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff"
    });
  }

  if (url.pathname === "/api/content" && request.method === "PUT") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const nextContent = JSON.parse(await readBody(request));
    await writeContent(nextContent);
    return sendJson(response, 200, nextContent);
  }

  if (url.pathname === "/api/football/status" && request.method === "GET") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const usage = await withSportsDataState(async (state) => theSportsDbUsageSummary(state));
    return sendJson(response, 200, {
      configured: true,
      fixtureSyncEnabled: true,
      provider: "TheSportsDB Free",
      usage
    }, { "Cache-Control": "no-store, max-age=0" });
  }

  if (url.pathname === "/api/league/storage-status" && request.method === "GET") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const content = await readContent();
    const relational = await ensureRelationalLeagueStorage(content);
    if (!relational) {
      return sendJson(response, 200, {
        mode: "legacy-json",
        relationalSchemaAvailable: false
      }, { "Cache-Control": "no-store, max-age=0" });
    }
    const usage = await relationalLeagueStorage.usage();
    const ratio = usage.freePlanLimitBytes ? usage.databaseBytes / usage.freePlanLimitBytes : 0;
    return sendJson(response, 200, {
      mode: "relational-v2",
      relationalSchemaAvailable: true,
      usage: {
        ...usage,
        percentOfFreePlanDatabase: Math.round(ratio * 1000) / 10,
        status: ratio >= 0.8 ? "critical" : ratio >= 0.6 ? "warning" : "healthy"
      }
    }, { "Cache-Control": "no-store, max-age=0" });
  }

  if (url.pathname === "/api/football/sync" && request.method === "POST") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const payload = JSON.parse(await readBody(request) || "{}");
    try {
      const result = await queueFootballSync({ leagueId: payload.leagueId, round: payload.round, forceSchedule: true });
      return sendJson(response, 200, {
        content: result.content,
        summary: result.summary,
        usage: result.usage,
        message: footballSyncMessage(result.summary)
      }, { "Cache-Control": "no-store, max-age=0" });
    } catch (error) {
      return sendJson(response, error.statusCode || 502, { error: error.message }, { "Cache-Control": "no-store, max-age=0" });
    }
  }

  if (url.pathname === "/api/internal/football-sync" && request.method === "POST") {
    if (!internalFootballSyncAuthorized(request)) return sendJson(response, 401, { error: "Unauthorized" });
    try {
      const result = await queueFootballSync();
      return sendJson(response, 200, { ok: true, summary: result.summary, usage: result.usage });
    } catch (error) {
      return sendJson(response, error.statusCode || 502, { error: error.message });
    }
  }

  if (url.pathname === "/api/team-media/search" && request.method === "GET") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const query = String(url.searchParams.get("q") || "").trim();
    try {
      const result = await withSportsDataState(async (cache) => {
        const cachedResults = cachedTeamMediaSearch(cache, query);
        if (cachedResults) {
          return { results: cachedResults, cacheHit: true, catalogSize: Object.keys(cache.teams || {}).length, usage: theSportsDbUsageSummary(cache) };
        }
        const searchResult = searchTeamMediaCatalog(query, { cache });
        const normalizedQuery = normalizeTeamSearch(query);
        const exactLocalResults = searchResult.results.filter((team) =>
          normalizeTeamSearch(team.name) === normalizedQuery || normalizeTeamSearch(team.code) === normalizedQuery
        );
        if (exactLocalResults.length) {
          const results = rememberTeamMediaSearch(cache, query, exactLocalResults);
          return { results, cacheHit: true, catalogSize: Object.keys(cache.teams || {}).length, usage: theSportsDbUsageSummary(cache) };
        }
        let providerResults = [];
        try {
          const response = await requestTheSportsDb("searchteams.php", { t: query }, { state: cache });
          providerResults = response.teams
            .filter((team) => String(team.strSport || "").toLowerCase() === "soccer")
            .map((team) => theSportsDbTeamMedia(team))
            .filter(Boolean);
        } catch (error) {
          if (!searchResult.results.length) throw error;
        }
        const combined = [...new Map([...providerResults, ...searchResult.results].map((team) => [String(team.id), team])).values()];
        const results = rememberTeamMediaSearch(cache, query, combined);
        return { results, cacheHit: false, catalogSize: Object.keys(cache.teams || {}).length, usage: theSportsDbUsageSummary(cache) };
      });
      return sendJson(response, 200, {
        results: result.results,
        cached: Boolean(result.cacheHit),
        catalogSize: result.catalogSize,
        usage: result.usage
      }, { "Cache-Control": "no-store, max-age=0" });
    } catch (error) {
      const statusCode = error.statusCode || (/поне 3/.test(error.message) ? 400 : 502);
      return sendJson(response, statusCode, { error: error.message }, { "Cache-Control": "no-store, max-age=0" });
    }
  }

  if (url.pathname === "/api/league" && request.method === "GET") {
    const playerId = getLeaguePlayerId(request);
    const state = await leagueState(request);
    const headers = { "Cache-Control": "no-store, max-age=0" };
    if (playerId && state.me) headers["Set-Cookie"] = leagueCookieHeader(playerId);
    return sendJson(response, 200, state, headers);
  }

  if (url.pathname === "/api/league/register" && request.method === "POST") {
    if (leagueIdentityRateLimited(request)) {
      return sendJson(response, 429, { error: "Твърде много опити. Опитай отново по-късно." });
    }
    const currentPlayerId = getLeaguePlayerId(request);
    const content = await readContent();
    const relationalReady = await ensureRelationalLeagueStorage(content);
    const currentPlayer = relationalReady
      ? await relationalLeagueStorage.player(currentPlayerId)
      : (await readLeagueStore()).players.find((player) => player.id === currentPlayerId);
    if (currentPlayer) {
      return sendJson(response, 409, { error: "Вече имаш активно участие в Лигата на прогнозите в този браузър." });
    }
    let nickname;
    try {
      nickname = normalizeNickname(JSON.parse(await readBody(request)).nickname);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }

    try {
      if (relationalReady) {
        const key = nicknameKey(nickname);
        if (await relationalLeagueStorage.playerByNicknameKey(key)) {
          throw new Error("Този прякор или негов вариант вече участва. Избери друг или използвай кода си за възстановяване.");
        }
        let recoveryCode = createRecoveryCode();
        let recoveryHash = hashRecoveryCode(recoveryCode, sessionSecret);
        while (await relationalLeagueStorage.playerByRecoveryHash(recoveryHash)) {
          recoveryCode = createRecoveryCode();
          recoveryHash = hashRecoveryCode(recoveryCode, sessionSecret);
        }
        const player = await relationalLeagueStorage.createPlayer({
          id: crypto.randomUUID(),
          nickname,
          nicknameKey: key,
          recoveryHash,
          createdAt: new Date().toISOString()
        });
        return sendJson(response, 201, {
          recoveryCode,
          league: await leagueState(request, null, player.id)
        }, { "Set-Cookie": leagueCookieHeader(player.id) });
      }
      const { store, result } = await mutateLeagueStore((leagueStore) => {
        const key = nicknameKey(nickname);
        if (nicknameIsTaken(leagueStore.players, nickname)) {
          throw new Error("Този прякор или негов вариант вече участва. Избери друг или използвай кода си за възстановяване.");
        }
        let recoveryCode = createRecoveryCode();
        let recoveryHash = hashRecoveryCode(recoveryCode, sessionSecret);
        while (leagueStore.players.some((player) => safeRecoveryMatch(player, recoveryHash))) {
          recoveryCode = createRecoveryCode();
          recoveryHash = hashRecoveryCode(recoveryCode, sessionSecret);
        }
        const player = {
          id: crypto.randomUUID(),
          nickname,
          nicknameKey: key,
          recoveryHash,
          createdAt: new Date().toISOString()
        };
        leagueStore.players.push(player);
        return { player, recoveryCode };
      });
      return sendJson(response, 201, {
        recoveryCode: result.recoveryCode,
        league: await leagueState(request, store, result.player.id)
      }, { "Set-Cookie": leagueCookieHeader(result.player.id) });
    } catch (error) {
      return sendJson(response, 409, { error: error.message });
    }
  }

  if (url.pathname === "/api/league/recover" && request.method === "POST") {
    if (leagueIdentityRateLimited(request)) {
      return sendJson(response, 429, { error: "Твърде много опити. Опитай отново по-късно." });
    }
    let recoveryHash;
    try {
      const payload = JSON.parse(await readBody(request));
      recoveryHash = hashRecoveryCode(payload.recoveryCode, sessionSecret);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
    const content = await readContent();
    const relationalReady = await ensureRelationalLeagueStorage(content);
    const store = relationalReady ? null : await readLeagueStore();
    const player = relationalReady
      ? await relationalLeagueStorage.playerByRecoveryHash(recoveryHash)
      : store.players.find((item) => safeRecoveryMatch(item, recoveryHash));
    if (!player) return sendJson(response, 404, { error: "Не открихме участие с този код за възстановяване." });
    return sendJson(response, 200, { league: await leagueState(request, relationalReady ? null : store, player.id) }, {
      "Set-Cookie": leagueCookieHeader(player.id)
    });
  }

  if (url.pathname === "/api/league/recovery-code" && request.method === "POST") {
    const playerId = getLeaguePlayerId(request);
    if (!playerId) return sendJson(response, 401, { error: "Първо създай или възстанови участие в Лигата на прогнозите." });
    if (leagueIdentityRateLimited(request)) {
      return sendJson(response, 429, { error: "Твърде много опити. Опитай отново по-късно." });
    }
    try {
      const content = await readContent();
      if (await ensureRelationalLeagueStorage(content)) {
        const player = await relationalLeagueStorage.player(playerId);
        if (!player) throw new Error("Участието в Лигата на прогнозите не е намерено.");
        let recoveryCode = createRecoveryCode();
        let recoveryHash = hashRecoveryCode(recoveryCode, sessionSecret);
        while (await relationalLeagueStorage.playerByRecoveryHash(recoveryHash)) {
          recoveryCode = createRecoveryCode();
          recoveryHash = hashRecoveryCode(recoveryCode, sessionSecret);
        }
        await relationalLeagueStorage.updatePlayer(playerId, { recoveryHash });
        return sendJson(response, 200, {
          recoveryCode,
          league: await leagueState(request, null, playerId)
        }, { "Set-Cookie": leagueCookieHeader(playerId) });
      }
      const { store, result } = await mutateLeagueStore((leagueStore) => rotatePlayerRecoveryCode(leagueStore, playerId, sessionSecret));
      return sendJson(response, 200, {
        recoveryCode: result.recoveryCode,
        league: await leagueState(request, store, playerId)
      }, { "Set-Cookie": leagueCookieHeader(playerId) });
    } catch (error) {
      return sendJson(response, 409, { error: error.message });
    }
  }

  if (url.pathname === "/api/league/profile" && request.method === "PATCH") {
    const playerId = getLeaguePlayerId(request);
    if (!playerId) return sendJson(response, 401, { error: "Първо създай или възстанови участие в Лигата на прогнозите." });
    let nickname;
    try {
      nickname = normalizeNickname(JSON.parse(await readBody(request)).nickname);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
    try {
      const content = await readContent();
      if (await ensureRelationalLeagueStorage(content)) {
        const player = await relationalLeagueStorage.player(playerId);
        if (!player) throw new Error("Участието в Лигата на прогнозите не е намерено.");
        const key = nicknameKey(nickname);
        const duplicate = await relationalLeagueStorage.playerByNicknameKey(key);
        if (duplicate && duplicate.id !== playerId) throw new Error("Този прякор или негов вариант вече участва.");
        await relationalLeagueStorage.updatePlayer(playerId, { nickname, nicknameKey: key });
        return sendJson(response, 200, { league: await leagueState(request, null, playerId) }, {
          "Set-Cookie": leagueCookieHeader(playerId)
        });
      }
      const { store } = await mutateLeagueStore((leagueStore) => {
        const player = leagueStore.players.find((item) => item.id === playerId);
        if (!player) throw new Error("Участието в Лигата на прогнозите не е намерено.");
        const key = nicknameKey(nickname);
        if (nicknameIsTaken(leagueStore.players, nickname, playerId)) {
          throw new Error("Този прякор или негов вариант вече участва.");
        }
        player.nickname = nickname;
        player.nicknameKey = key;
        player.updatedAt = new Date().toISOString();
      });
      return sendJson(response, 200, { league: await leagueState(request, store, playerId) }, {
        "Set-Cookie": leagueCookieHeader(playerId)
      });
    } catch (error) {
      return sendJson(response, 409, { error: error.message });
    }
  }

  const leaguePredictionMatch = url.pathname.match(/^\/api\/league\/([^/]+)\/predictions\/([^/]+)$/);
  const legacyLeaguePredictionMatch = url.pathname.match(/^\/api\/league\/predictions\/([^/]+)$/);
  if ((leaguePredictionMatch || legacyLeaguePredictionMatch) && request.method === "PUT") {
    const playerId = getLeaguePlayerId(request);
    if (!playerId) return sendJson(response, 401, { error: "Първо избери прякор за Лигата на прогнозите." });
    const content = await readContent();
    const collection = normalizeLeagueCollection(content.predictionLeague);
    const leagueId = normalizeLeagueId(leaguePredictionMatch ? decodeURIComponent(leaguePredictionMatch[1]) : requestedLeagueId(request));
    const leagueConfig = collection.leagues.find((league) => league.id === leagueId);
    if (!collection.enabled || !leagueConfig?.enabled) return sendJson(response, 409, { error: "Тази лига не е активна в момента." });
    const matchId = decodeURIComponent(leaguePredictionMatch ? leaguePredictionMatch[2] : legacyLeaguePredictionMatch[1]);
    const match = leagueConfig.matches.find((item) => item.id === matchId);
    if (!match) return sendJson(response, 404, { error: "Този мач не е намерен." });
    if (matchStatus(match) !== "open") return sendJson(response, 409, { error: "Прогнозите за този мач вече са заключени." });
    let prediction;
    try {
      prediction = normalizePrediction(JSON.parse(await readBody(request)));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
    try {
      if (await ensureRelationalLeagueStorage(content)) {
        if (!await relationalLeagueStorage.player(playerId)) {
          throw new Error("Участието в Лигата на прогнозите не е намерено.");
        }
        const now = new Date().toISOString();
        await relationalLeagueStorage.upsertPrediction({
          id: crypto.randomUUID(),
          playerId,
          leagueId: leagueConfig.id,
          matchId,
          ...prediction,
          submittedAt: now,
          updatedAt: now
        });
        return sendJson(response, 200, { league: await leagueState(request, null, playerId, leagueConfig.id) }, {
          "Set-Cookie": leagueCookieHeader(playerId)
        });
      }
      const { store } = await mutateLeagueStore((leagueStore) => {
        if (!leagueStore.players.some((player) => player.id === playerId)) throw new Error("Участието в Лигата на прогнозите не е намерено.");
        const now = new Date().toISOString();
        const existing = leagueStore.predictions.find((item) =>
          item.playerId === playerId && item.matchId === matchId && (item.leagueId
            ? normalizeLeagueId(item.leagueId) === leagueConfig.id
            : leagueConfig.id === "general")
        );
        if (existing) {
          existing.leagueId = leagueConfig.id;
          existing.homeScore = prediction.homeScore;
          existing.awayScore = prediction.awayScore;
          existing.updatedAt = now;
        } else {
          leagueStore.predictions.push({
            id: crypto.randomUUID(),
            playerId,
            leagueId: leagueConfig.id,
            matchId,
            ...prediction,
            submittedAt: now,
            updatedAt: now
          });
        }
      });
      return sendJson(response, 200, { league: await leagueState(request, store, playerId, leagueConfig.id) }, {
        "Set-Cookie": leagueCookieHeader(playerId)
      });
    } catch (error) {
      return sendJson(response, 409, { error: error.message });
    }
  }

  const championPredictionMatch = url.pathname.match(/^\/api\/league\/([^/]+)\/champion-prediction$/);
  if (championPredictionMatch && request.method === "PUT") {
    const playerId = getLeaguePlayerId(request);
    if (!playerId) return sendJson(response, 401, { error: "Първо избери прякор за Лигата на прогнозите." });
    const content = await readContent();
    const collection = normalizeLeagueCollection(content.predictionLeague);
    const leagueId = normalizeLeagueId(decodeURIComponent(championPredictionMatch[1]));
    const leagueConfig = collection.leagues.find((league) => league.id === leagueId);
    if (!collection.enabled || !leagueConfig?.enabled || !leagueConfig.championForecast.enabled) return sendJson(response, 409, { error: "Прогнозата за шампион не е активна." });
    const now = Date.now();
    const configuredOpensAt = Date.parse(leagueConfig.championForecast.opensAt || "");
    const configuredClosesAt = Date.parse(leagueConfig.championForecast.closesAt || "");
    const firstKickoff = Math.min(...leagueConfig.matches.map((match) => Date.parse(match.kickoffAt || "")).filter(Number.isFinite));
    const closesAt = Number.isFinite(configuredClosesAt) ? configuredClosesAt : firstKickoff;
    const opensAt = Number.isFinite(configuredOpensAt) ? configuredOpensAt : Number.isFinite(closesAt)
      ? closesAt - leagueConfig.championForecast.windowDays * 86_400_000
      : NaN;
    if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt) || now < opensAt || now >= closesAt) return sendJson(response, 409, { error: "Прогнозата за шампион не приема избори в момента." });
    let team;
    try {
      const candidateStore = await readLeagueStore();
      const candidateMatches = [...leagueConfig.matches, ...candidateStore.archivedMatches.filter((match) => normalizeLeagueId(match.leagueId) === leagueId)];
      team = normalizeChampionPrediction(JSON.parse(await readBody(request)), [...new Set(candidateMatches.flatMap((match) => [match.homeTeam, match.awayTeam]))]);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
    try {
      if (await ensureRelationalLeagueStorage(content)) {
        if (!await relationalLeagueStorage.player(playerId)) throw new Error("Участието в Лигата на прогнозите не е намерено.");
        const submittedAt = new Date().toISOString();
        await relationalLeagueStorage.upsertSeasonPrediction({ playerId, leagueId, team, submittedAt, updatedAt: submittedAt });
        return sendJson(response, 200, { league: await leagueState(request, null, playerId, leagueId) }, { "Set-Cookie": leagueCookieHeader(playerId) });
      }
      const { store } = await mutateLeagueStore((leagueStore) => {
        if (!leagueStore.players.some((player) => player.id === playerId)) throw new Error("Участието в Лигата на прогнозите не е намерено.");
        leagueStore.seasonPredictions ||= [];
        const existing = leagueStore.seasonPredictions.find((prediction) => prediction.playerId === playerId && normalizeLeagueId(prediction.leagueId) === leagueId);
        const submittedAt = new Date().toISOString();
        if (existing) { existing.team = team; existing.updatedAt = submittedAt; }
        else leagueStore.seasonPredictions.push({ id: crypto.randomUUID(), playerId, leagueId, team, submittedAt, updatedAt: submittedAt });
      });
      return sendJson(response, 200, { league: await leagueState(request, store, playerId, leagueId) }, { "Set-Cookie": leagueCookieHeader(playerId) });
    } catch (error) {
      return sendJson(response, 409, { error: error.message });
    }
  }

  if (url.pathname === "/api/votes" && request.method === "GET") {
    const token = getVoterToken(request);
    return sendJson(response, 200, { polls: await voteState(request, token) });
  }

  if (url.pathname === "/api/engagement" && request.method === "GET") {
    return sendJson(response, 200, await engagementState(getVoterToken(request)), {
      "Cache-Control": "no-store, max-age=0"
    });
  }

  const newsReactionMatch = url.pathname.match(/^\/api\/engagement\/news\/([^/]+)$/);
  if (newsReactionMatch && request.method === "POST") {
    const existingToken = getVoterToken(request);
    const token = existingToken || makeVoterToken();
    const newsId = decodeURIComponent(newsReactionMatch[1]);
    const payload = JSON.parse(await readBody(request));
    const reaction = String(payload.reaction || "");
    const choices = ["top", "analysis", "controversial", "more"];
    const content = await readContent();
    const exists = (content.news || []).some((item, index) => newsItemSlug(item, index) === newsId);
    if (!exists) return sendJson(response, 404, { error: "Тази новина не е налична." });
    if (!choices.includes(reaction)) return sendJson(response, 400, { error: "Невалидна реакция." });

    const { store } = await mutateVoteStore((stored) => {
      stored.newsReactions ||= {};
      stored.newsReactions[newsId] ||= { counts: {}, voters: {} };
      applyChoice(stored.newsReactions[newsId], choices, voterHash(token, `news:${newsId}`), reaction);
    });
    return sendJson(response, 200, await engagementState(token, content, store), existingToken ? {} : {
      "Set-Cookie": voterCookieHeader(token)
    });
  }

  const predictionVoteMatch = url.pathname.match(/^\/api\/engagement\/predictions\/([^/]+)$/);
  if (predictionVoteMatch && request.method === "POST") {
    const existingToken = getVoterToken(request);
    const token = existingToken || makeVoterToken();
    const predictionId = decodeURIComponent(predictionVoteMatch[1]);
    const payload = JSON.parse(await readBody(request));
    const choice = String(payload.choice || "");
    const choices = ["agree", "disagree"];
    const content = await readContent();
    const exists = (content.predictions || []).some((prediction) => String(prediction.id || "") === predictionId);
    if (!exists) return sendJson(response, 404, { error: "Тази прогноза не е налична." });
    if (!choices.includes(choice)) return sendJson(response, 400, { error: "Невалиден избор." });

    const { store } = await mutateVoteStore((stored) => {
      stored.predictionVotes ||= {};
      stored.predictionVotes[predictionId] ||= { counts: {}, voters: {} };
      applyChoice(stored.predictionVotes[predictionId], choices, voterHash(token, `prediction:${predictionId}`), choice);
    });
    return sendJson(response, 200, await engagementState(token, content, store), existingToken ? {} : {
      "Set-Cookie": voterCookieHeader(token)
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

    const hash = voterHash(token, pollId);
    const { result: alreadyVoted } = await mutateVoteStore((stored) => {
      stored.polls ||= {};
      stored.polls[pollId] ||= { counts: {}, voters: {} };
      if (stored.polls[pollId].voters[hash]) return true;
      stored.polls[pollId].voters[hash] = option.id;
      stored.polls[pollId].counts[option.id] = (Number(stored.polls[pollId].counts[option.id]) || 0) + 1;
      return false;
    });
    if (alreadyVoted) {
      return sendJson(response, 409, { error: "Вече си гласувал в тази анкета.", polls: await voteState(request, token) });
    }
    return sendJson(response, 200, { polls: await voteState(request, token) }, existingToken ? {} : {
      "Set-Cookie": voterCookieHeader(token)
    });
  }

  if (url.pathname === "/health" && request.method === "GET") {
    return sendJson(response, 200, { ok: true, storage: cloudStorageEnabled ? "supabase" : "local" });
  }

  if (url.pathname === "/api/giveaway/entries" && request.method === "POST") {
    const payload = JSON.parse(await readBody(request));
    if (payload.website) return sendJson(response, 200, { ok: true });
    const content = await readContent();
    const giveaway = content.giveaway;
    if (!giveaway || payload.giveawayId !== giveaway.id || !giveawayIsOpen(giveaway)) {
      return sendJson(response, 409, { error: "Този giveaway не е активен в момента." });
    }

    const ipKey = giveawayHash(clientIp(request), giveaway.id, "ip");
    const recent = (giveawayRateLimits.get(ipKey) || []).filter((time) => Date.now() - time < 60 * 60 * 1000);
    if (recent.length >= giveawayAttemptsPerHour) return sendJson(response, 429, { error: "Твърде много опити. Опитай отново по-късно." });
    recent.push(Date.now());
    giveawayRateLimits.set(ipKey, recent);

    const existingToken = getGiveawayToken(request);
    const token = existingToken || makeVoterToken();
    let normalized;
    try {
      normalized = normalizeGiveawayEntry(payload, giveaway, token);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
    const entry = {
      id: crypto.randomUUID(),
      giveawayId: giveaway.id,
      ...normalized,
      eligible: true,
      winnerRank: null,
      drawnAt: "",
      createdAt: new Date().toISOString()
    };
    if (await ensureRelationalGiveawayStorage()) {
      try {
        await relationalGiveawayStorage.createEntry(entry);
      } catch (error) {
        if (error.statusCode === 409) {
          return sendJson(response, 409, { error: "Вече имаш записано участие в този giveaway." });
        }
        throw error;
      }
    } else {
      const entries = await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
      if (entries.some((item) => item.giveawayId === giveaway.id && (item.emailHash === normalized.emailHash || item.browserHash === normalized.browserHash))) {
        return sendJson(response, 409, { error: "Вече имаш записано участие в този giveaway." });
      }
      entries.unshift(entry);
      await writeJsonFile(giveawayEntriesFile, entries, "giveawayEntries");
    }
    return sendJson(response, 201, { ok: true, id: entry.id }, existingToken ? {} : {
      "Set-Cookie": `dis_giveaway=${token}; HttpOnly; SameSite=Lax; Max-Age=${oneYear}; Path=/`
    });
  }

  if (url.pathname === "/api/giveaway/status" && request.method === "GET") {
    const content = await readContent();
    const giveaway = content.giveaway;
    const giveawayId = url.searchParams.get("giveawayId") || "";
    if (!giveaway || giveaway.id !== giveawayId || !giveawayIsOpen(giveaway)) {
      return sendJson(response, 404, { error: "Този giveaway не е активен в момента." });
    }
    const participantCount = await ensureRelationalGiveawayStorage()
      ? await relationalGiveawayStorage.participantCount(giveaway.id)
      : (await readJsonFile(giveawayEntriesFile, [], "giveawayEntries"))
          .filter((entry) => entry.giveawayId === giveaway.id && entry.eligible !== false).length;
    return sendJson(response, 200, { participantCount }, { "Cache-Control": "no-store, max-age=0" });
  }

  if (url.pathname === "/api/giveaway/entries" && request.method === "GET") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const giveawayId = url.searchParams.get("giveawayId") || "";
    const entries = await ensureRelationalGiveawayStorage()
      ? await relationalGiveawayStorage.entries(giveawayId)
      : await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
    return sendJson(response, 200, { entries: entries.filter((entry) => entry.giveawayId === giveawayId).map(publicGiveawayEntry) });
  }

  if (url.pathname === "/api/giveaway/entries" && request.method === "DELETE") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const giveawayId = url.searchParams.get("giveawayId") || "";
    if (await ensureRelationalGiveawayStorage()) {
      await relationalGiveawayStorage.deleteGiveaway(giveawayId);
    } else {
      const entries = await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
      await writeJsonFile(giveawayEntriesFile, entries.filter((entry) => entry.giveawayId !== giveawayId), "giveawayEntries");
    }
    return send(response, 204, "");
  }

  const giveawayEntryMatch = url.pathname.match(/^\/api\/giveaway\/entries\/([^/]+)$/);
  if (giveawayEntryMatch && request.method === "PATCH") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const payload = JSON.parse(await readBody(request));
    const entryId = decodeURIComponent(giveawayEntryMatch[1]);
    if (await ensureRelationalGiveawayStorage()) {
      const existing = await relationalGiveawayStorage.entry(entryId);
      if (!existing) return sendJson(response, 404, { error: "Участникът не е намерен." });
      if (existing.winnerRank) return sendJson(response, 409, { error: "Първо нулирай резултата от тегленето." });
      const updated = await relationalGiveawayStorage.setEligibility(entryId, payload.eligible);
      if (!updated) return sendJson(response, 409, { error: "Участникът е променен едновременно. Презареди списъка." });
      return sendJson(response, 200, publicGiveawayEntry(updated));
    }
    const entries = await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) return sendJson(response, 404, { error: "Участникът не е намерен." });
    if (entry.winnerRank) return sendJson(response, 409, { error: "Първо нулирай резултата от тегленето." });
    entry.eligible = Boolean(payload.eligible);
    await writeJsonFile(giveawayEntriesFile, entries, "giveawayEntries");
    return sendJson(response, 200, publicGiveawayEntry(entry));
  }

  if (giveawayEntryMatch && request.method === "DELETE") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const entryId = decodeURIComponent(giveawayEntryMatch[1]);
    if (await ensureRelationalGiveawayStorage()) {
      const entry = await relationalGiveawayStorage.entry(entryId);
      if (entry?.winnerRank) return sendJson(response, 409, { error: "Първо нулирай резултата от тегленето, преди да изтриеш победител." });
      if (entry && !await relationalGiveawayStorage.deleteEntry(entryId)) {
        return sendJson(response, 409, { error: "Участникът е променен едновременно. Презареди списъка." });
      }
    } else {
      const entries = await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
      const entry = entries.find((item) => item.id === entryId);
      if (entry?.winnerRank) return sendJson(response, 409, { error: "Първо нулирай резултата от тегленето, преди да изтриеш победител." });
      await writeJsonFile(giveawayEntriesFile, entries.filter((entry) => entry.id !== entryId), "giveawayEntries");
    }
    return send(response, 204, "");
  }

  if (url.pathname === "/api/giveaway/draw" && request.method === "POST") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const payload = JSON.parse(await readBody(request));
    const content = await readContent();
    const giveaway = content.giveaway;
    if (!giveaway || giveaway.id !== payload.giveawayId) return sendJson(response, 404, { error: "Първо запази giveaway настройките." });
    if (giveawayIsOpen(giveaway)) return sendJson(response, 409, { error: "Спри записването или изчакай крайния срок преди тегленето." });
    const relationalGiveawayReady = await ensureRelationalGiveawayStorage();
    const entries = relationalGiveawayReady
      ? await relationalGiveawayStorage.entries(giveaway.id)
      : await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
    const giveawayEntries = entries.filter((entry) => entry.giveawayId === giveaway.id);
    if (giveawayEntries.some((entry) => entry.winnerRank)) return sendJson(response, 409, { error: "Вече има изтеглен победител. Нулирай резултата само ако наистина трябва да теглиш отново." });
    const eligible = giveawayEntries.filter((entry) => entry.eligible !== false);
    const prizeSlots = giveawayPrizeSlots(giveaway);
    const winnerCount = prizeSlots.length;
    if (eligible.length < winnerCount) return sendJson(response, 409, { error: "Няма достатъчно допуснати участници за зададения брой победители." });
    const winners = drawRandomEntries(eligible, winnerCount);
    const randomizedPrizeSlots = drawRandomEntries(prizeSlots, prizeSlots.length);
    const drawnAt = new Date().toISOString();
    const assignments = winners.map((winner, index) => ({
      id: winner.id,
      winnerRank: index + 1,
      prizeId: randomizedPrizeSlots[index].id,
      prizeName: randomizedPrizeSlots[index].name,
      prizeImage: randomizedPrizeSlots[index].image
    }));
    if (relationalGiveawayReady) {
      try {
        await relationalGiveawayStorage.assignWinners(giveaway.id, assignments, drawnAt);
      } catch (error) {
        return sendJson(response, 409, { error: "Тегленето не беше записано, защото данните са променени. Презареди участниците и опитай отново." });
      }
      const savedEntries = await relationalGiveawayStorage.entries(giveaway.id);
      return sendJson(response, 200, {
        winners: savedEntries.filter((entry) => entry.winnerRank).sort((a, b) => a.winnerRank - b.winnerRank).map(publicGiveawayEntry),
        drawnAt
      });
    }
    winners.forEach((winner, index) => {
      winner.winnerRank = assignments[index].winnerRank;
      winner.drawnAt = drawnAt;
      winner.prizeId = assignments[index].prizeId;
      winner.prizeName = assignments[index].prizeName;
      winner.prizeImage = assignments[index].prizeImage;
    });
    await writeJsonFile(giveawayEntriesFile, entries, "giveawayEntries");
    return sendJson(response, 200, { winners: winners.map(publicGiveawayEntry), drawnAt });
  }

  if (url.pathname === "/api/giveaway/reset" && request.method === "POST") {
    if (!isAuthenticated(request)) return sendJson(response, 401, { error: "Unauthorized" });
    const payload = JSON.parse(await readBody(request));
    if (await ensureRelationalGiveawayStorage()) {
      await relationalGiveawayStorage.resetWinners(payload.giveawayId);
    } else {
      const entries = await readJsonFile(giveawayEntriesFile, [], "giveawayEntries");
      entries.filter((entry) => entry.giveawayId === payload.giveawayId).forEach((entry) => {
        entry.winnerRank = null;
        entry.drawnAt = "";
        entry.prizeId = "";
        entry.prizeName = "";
        entry.prizeImage = "";
      });
      await writeJsonFile(giveawayEntriesFile, entries, "giveawayEntries");
    }
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/api/messages" && request.method === "POST") {
    const payload = JSON.parse(await readBody(request));
    if (payload.website) return sendJson(response, 200, { ok: true });
    const ipKey = crypto.createHash("sha256").update(`${clientIp(request)}:${sessionSecret}`).digest("hex");
    const recent = (messageRateLimits.get(ipKey) || []).filter((time) => Date.now() - time < 60 * 60 * 1000);
    if (recent.length >= messageAttemptsPerHour) return sendJson(response, 429, { error: "Твърде много съобщения. Опитай отново по-късно." });
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
    void notifyAboutMessage(message);
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
    return send(response, 200, loginPage(), {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow"
    });
  }

  if (url.pathname === "/login" && request.method === "POST") {
    const body = new URLSearchParams(await readBody(request));
    if (body.get("password") !== adminPassword) {
      return send(response, 401, loginPage("Грешна парола."), {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow"
      });
    }

    return send(response, 302, "", {
      Location: "/admin",
      "Set-Cookie": `dis_session=${makeSession()}; HttpOnly; SameSite=Lax; Max-Age=${oneDay}; Path=/`
    });
  }

  if (url.pathname === "/admin.webmanifest" && !isAuthenticated(request)) {
    return send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }

  if (url.pathname === "/admin" || url.pathname === "/admin.html") {
    if (!isAuthenticated(request)) return send(response, 302, "", { Location: "/login" });
    const adminPath = path.join(root, "admin.html");
    return send(response, 200, fs.readFileSync(adminPath), {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow"
    });
  }

  if (url.pathname === "/admin.html" && !isAuthenticated(request)) {
    return send(response, 302, "", { Location: "/login" });
  }

  if (url.pathname === "/sitemap.xml" && request.method === "GET") {
    return send(response, 200, renderSitemap(await readContent()), { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache" });
  }

  const newsDetailMatch = url.pathname.match(/^\/news\/([^/]+)$/);
  if (newsDetailMatch && request.method === "GET") {
    const content = await readContent();
    let slug = "";
    try {
      slug = decodeURIComponent(newsDetailMatch[1]);
    } catch {
      slug = "";
    }
    const newsItems = Array.isArray(content.news) ? content.news : [];
    const newsIndex = newsItems.findIndex((item, index) => newsItemSlug(item, index) === slug);
    if (newsIndex < 0) {
      const missing = { slug: slug || "not-found", title: "Новината не е намерена", excerpt: "Тази публикация не е налична.", imageUrl: "" };
      return send(response, 404, renderNewsDetailHtml(missing), { "Content-Type": "text/html; charset=utf-8" });
    }
    return send(response, 200, renderNewsDetailHtml(newsItems[newsIndex], newsIndex), { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  }

  if (url.pathname === "/news") {
    const newsPath = path.join(root, "news.html");
    return send(response, 200, fs.readFileSync(newsPath), { "Content-Type": "text/html; charset=utf-8" });
  }

  const pageRoutes = {
    "/fan-zone": "fan-zone.html",
    "/hosts": "hosts.html",
    "/partners": "partners.html",
    "/contact": "contact.html",
    "/privacy": "privacy.html",
    "/cookies": "cookies.html"
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
    {
      const syncFootball = () => queueFootballSync().catch((error) => {
        console.warn(`Scheduled TheSportsDB sync failed: ${error.message}`);
      });
      const initialFootballSyncTimer = setTimeout(syncFootball, 45_000);
      initialFootballSyncTimer.unref();
      const footballSyncTimer = setInterval(syncFootball, 30 * 60 * 1000);
      footballSyncTimer.unref();
    }
    if (newsdataApiKey) {
      readPressNews().catch((error) => console.warn(`Initial external-news refresh failed: ${externalNewsErrorMessage(error)}`));
      const pressNewsCheckTimer = setInterval(() => {
        readPressNews().catch((error) => console.warn(`Scheduled external-news refresh failed: ${externalNewsErrorMessage(error)}`));
      }, 60 * 60 * 1000);
      pressNewsCheckTimer.unref();
    }
  });
