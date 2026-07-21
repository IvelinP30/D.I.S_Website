const crypto = require("crypto");

const NEWSDATA_BASE_URL = "https://newsdata.io/api/1/latest";
const PRESS_NEWS_CACHE_TTL = 12 * 60 * 60 * 1000;
const PRESS_NEWS_MAX_AGE = 72 * 60 * 60 * 1000;
const PRESS_NEWS_CACHE_VERSION = 2;

const BULGARIAN_FOOTBALL_SIGNALS = [
  "български футбол", "българия", "първа лига", "efbet лига", "купа на българия",
  "национален отбор", "лудогорец", "левски", "цска", "ботев пловдив", "черно море",
  "локомотив пловдив", "славия", "берое", "арда", "спартак варна", "септември"
];

const FOOTBALL_SIGNALS = [
  "футбол", "football", "soccer", "шампионска лига", "лига европа", "конференц лига",
  "първа лига", "efbet лига", "купа на българия", "национален отбор", "уефа", "фифа",
  "левски", "цска", "лудогорец", "ботев пловдив", "черно море", "локомотив пловдив",
  "premier league", "champions league", "europa league", "conference league", "uefa", "fifa"
];

const TITLE_STOP_WORDS = new Set([
  "футбол", "футболен", "футболна", "футболни", "спорт", "sports", "след", "преди",
  "като", "който", "която", "които", "това", "тази", "този", "със", "при", "към",
  "във", "над", "под", "отбор", "отбора", "лига", "league", "with", "from", "that",
  "this", "after", "before", "their", "about", "more"
]);

function cleanText(value = "", maxLength = 600) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function publicHttpUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function normalizedPublishedAt(value = "") {
  const rawValue = String(value || "").trim();
  const parseableValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawValue)
    ? `${rawValue.replace(" ", "T")}Z`
    : rawValue;
  const timestamp = Date.parse(parseableValue);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function normalizePressArticle(article = {}) {
  const title = cleanText(article.title, 240);
  const articleUrl = publicHttpUrl(article.articleUrl || article.link);
  if (!title || !articleUrl) return null;

  const sourceName = cleanText(article.sourceName || article.source_name || article.source_id || "Международна медия", 100);
  const articleId = cleanText(article.id || article.article_id, 160) || crypto.createHash("sha256").update(articleUrl).digest("hex").slice(0, 24);
  const country = (Array.isArray(article.country) ? article.country : [article.country])
    .map((value) => cleanText(value, 40).toLowerCase())
    .filter(Boolean);
  const rawSourcePriority = article.sourcePriority ?? article.source_priority;
  const sourcePriority = rawSourcePriority === null || rawSourcePriority === undefined || rawSourcePriority === ""
    ? null
    : Number(rawSourcePriority);
  const normalized = {
    id: articleId,
    title,
    description: cleanText(article.description, 520),
    articleUrl,
    sourceName,
    sourceUrl: publicHttpUrl(article.sourceUrl || article.source_url),
    publishedAt: normalizedPublishedAt(article.publishedAt || article.pubDateTZ || article.pubDate),
    language: cleanText(article.language, 16) || "en",
    country,
    sourcePriority: Number.isFinite(sourcePriority) && sourcePriority >= 0 ? sourcePriority : null
  };
  const keywordText = Array.isArray(article.keywords) ? article.keywords.join(" ") : article.keywords;
  const bulgarianHaystack = `${normalized.title} ${normalized.description} ${cleanText(keywordText, 300)} ${country.join(" ")}`.toLowerCase();
  normalized.isBulgarianFootball = Boolean(article.isBulgarianFootball)
    || country.includes("bulgaria")
    || country.includes("bg")
    || BULGARIAN_FOOTBALL_SIGNALS.some((signal) => bulgarianHaystack.includes(signal));
  return normalized;
}

function titleTokens(title = "") {
  return new Set(String(title || "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !TITLE_STOP_WORDS.has(word)));
}

function coverageScore(article, articles = []) {
  const tokens = titleTokens(article.title);
  if (tokens.size < 2) return 0;
  let relatedStories = 0;
  for (const candidate of articles) {
    if (candidate.articleUrl === article.articleUrl) continue;
    const candidateTokens = titleTokens(candidate.title);
    let sharedTokens = 0;
    for (const token of tokens) {
      if (candidateTokens.has(token)) sharedTokens += 1;
      if (sharedTokens >= 2) break;
    }
    if (sharedTokens >= 2) relatedStories += 1;
  }
  return Math.min(8, relatedStories * 2);
}

function articleInterestScore(article = {}, now = Date.now(), articles = []) {
  const haystack = `${article.title || ""} ${article.description || ""}`.toLowerCase();
  const signals = [
    "champions league", "world cup", "premier league", "la liga", "serie a", "bundesliga",
    "europa league", "uefa", "fifa", "transfer", "final", "derby", "record", "exclusive",
    "шампионска лига", "световно първенство", "премиър лийг", "ла лига", "серия а", "бундеслига",
    "лига европа", "уефа", "фифа", "трансфер", "финал", "дерби", "рекорд", "ексклузивно"
  ];
  const topicScore = signals.reduce((score, signal) => score + (haystack.includes(signal) ? 2 : 0), 0);
  const publishedAt = Date.parse(article.publishedAt || "");
  const ageHours = Number.isFinite(publishedAt) ? Math.max(0, (now - publishedAt) / 3_600_000) : 72;
  const sourceScore = Number.isFinite(article.sourcePriority)
    ? Math.max(0, 8 - Math.log10(article.sourcePriority + 1) * 2)
    : 0;
  const bulgarianFootballScore = article.isBulgarianFootball ? 24 : 0;
  return bulgarianFootballScore + topicScore + sourceScore + coverageScore(article, articles) + Math.max(0, 8 - ageHours / 6);
}

function rankPressArticles(articles = [], { now = Date.now(), limit = 12, sortMode = "interest" } = {}) {
  const unique = new Map();
  for (const rawArticle of articles) {
    const article = normalizePressArticle(rawArticle);
    if (!article) continue;
    const publishedAt = Date.parse(article.publishedAt || "");
    if (!Number.isFinite(publishedAt) || publishedAt > now + 5 * 60 * 1000 || now - publishedAt > PRESS_NEWS_MAX_AGE) continue;
    const duplicateKey = article.articleUrl.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    if (!unique.has(duplicateKey)) unique.set(duplicateKey, article);
  }
  const normalizedArticles = [...unique.values()];
  return normalizedArticles
    .sort((left, right) => {
      const dateDifference = Date.parse(right.publishedAt || "") - Date.parse(left.publishedAt || "");
      if (sortMode === "newest" && dateDifference) return dateDifference;
      const scoreDifference = articleInterestScore(right, now, normalizedArticles) - articleInterestScore(left, now, normalizedArticles);
      if (scoreDifference) return scoreDifference;
      return dateDifference;
    })
    .slice(0, Math.max(1, limit));
}

function mergePressArticles(existingItems = [], incomingItems = [], options = {}) {
  return rankPressArticles([...existingItems, ...incomingItems], options);
}

function articleLooksLikeFootball(article = {}) {
  const keywordText = Array.isArray(article.keywords) ? article.keywords.join(" ") : article.keywords;
  const haystack = `${cleanText(article.title, 240)} ${cleanText(article.description, 520)} ${cleanText(keywordText, 300)}`.toLowerCase();
  return FOOTBALL_SIGNALS.some((signal) => haystack.includes(signal));
}

function newsDataError(message, status) {
  const error = new Error(message || "NewsData request failed");
  error.statusCode = status;
  if (status === 401 || status === 403) error.code = "NEWSDATA_AUTH";
  else if (status === 429) error.code = "NEWSDATA_LIMIT";
  else error.code = "NEWSDATA_REQUEST_FAILED";
  return error;
}

async function fetchPressNews({ apiKey, fetchImpl = fetch, query = "футбол", language = "bg", now = Date.now(), limit = 10, requireFootball = false } = {}) {
  if (!String(apiKey || "").trim()) {
    const error = new Error("NewsData API is not configured");
    error.code = "NEWSDATA_NOT_CONFIGURED";
    throw error;
  }

  const url = new URL(NEWSDATA_BASE_URL);
  url.searchParams.set("apikey", String(apiKey).trim());
  const normalizedQuery = cleanText(query, 100);
  if (normalizedQuery) url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("category", "sports");
  url.searchParams.set("language", cleanText(language, 8).toLowerCase() || "bg");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  timeout.unref?.();
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || payload.status === "error") {
    const message = cleanText(payload.results?.message || payload.message || `NewsData request failed (${response.status})`, 220);
    throw newsDataError(message, response.status);
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  return rankPressArticles(requireFootball ? results.filter(articleLooksLikeFootball) : results, { now, limit });
}

async function fetchPressNewsSet({ queries = ["футбол"], limit = 20, ...options } = {}) {
  const uniqueQueries = [...new Set(queries.map((query) => cleanText(query, 100)).filter(Boolean))];
  const results = await Promise.allSettled(uniqueQueries.map((query) => fetchPressNews({ ...options, query, limit: 10 })));
  const successfulRequests = results.filter((result) => result.status === "fulfilled");
  if (!successfulRequests.length) {
    const failed = results.find((result) => result.status === "rejected");
    throw failed?.reason || new Error("NewsData request failed");
  }
  const fulfilled = successfulRequests.flatMap((result) => result.value);
  return rankPressArticles(fulfilled, { now: options.now || Date.now(), limit });
}

async function fetchPressNewsWithFallback(options = {}) {
  let targetedError = null;
  try {
    const targetedItems = await fetchPressNewsSet(options);
    if (targetedItems.length) return targetedItems;
  } catch (error) {
    targetedError = error;
  }

  try {
    const broadBulgarianItems = await fetchPressNews({
      ...options,
      query: "",
      limit: options.limit || 20,
      requireFootball: true
    });
    if (broadBulgarianItems.length) return broadBulgarianItems;
  } catch (fallbackError) {
    if (["NEWSDATA_AUTH", "NEWSDATA_LIMIT"].includes(fallbackError.code)) throw fallbackError;
    targetedError ||= fallbackError;
  }

  try {
    return await fetchPressNews({
      ...options,
      query: "football",
      language: "en",
      limit: options.limit || 20,
      requireFootball: true
    });
  } catch (internationalError) {
    throw targetedError || internationalError;
  }
}

function pressNewsCacheIsFresh(cache = {}, now = Date.now(), ttl = PRESS_NEWS_CACHE_TTL) {
  const refreshedAt = Date.parse(cache.refreshedAt || "");
  return cache.version === PRESS_NEWS_CACHE_VERSION
    && Array.isArray(cache.items)
    && Number.isFinite(refreshedAt)
    && now - refreshedAt < ttl;
}

module.exports = {
  NEWSDATA_BASE_URL,
  PRESS_NEWS_CACHE_VERSION,
  PRESS_NEWS_CACHE_TTL,
  PRESS_NEWS_MAX_AGE,
  fetchPressNews,
  fetchPressNewsSet,
  fetchPressNewsWithFallback,
  mergePressArticles,
  normalizePressArticle,
  pressNewsCacheIsFresh,
  rankPressArticles
};
