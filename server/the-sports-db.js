const THE_SPORTS_DB_BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";
const THE_SPORTS_DB_MINUTE_BUDGET = 20;

function usageDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function normalizeUsageState(state = {}, now = Date.now()) {
  state.usage ||= {};
  const day = usageDay(now);
  if (state.usage.day !== day) {
    state.usage = { day, requests: 0, recentRequests: [], lastRequestAt: "" };
  }
  state.usage.requests = Math.max(0, Number(state.usage.requests) || 0);
  state.usage.recentRequests = (Array.isArray(state.usage.recentRequests) ? state.usage.recentRequests : [])
    .map(Number)
    .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < 60_000);
  return state.usage;
}

function theSportsDbUsageSummary(state = {}, now = Date.now()) {
  const usage = normalizeUsageState(state, now);
  return {
    day: usage.day,
    used: usage.requests,
    minuteUsed: usage.recentRequests.length,
    minuteLimit: THE_SPORTS_DB_MINUTE_BUDGET,
    minuteRemaining: Math.max(0, THE_SPORTS_DB_MINUTE_BUDGET - usage.recentRequests.length),
    lastRequestAt: String(usage.lastRequestAt || "")
  };
}

function providerError(message, code, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function requestTheSportsDb(endpoint, parameters = {}, options = {}) {
  const cleanEndpoint = String(endpoint || "").replace(/^\/+/, "");
  if (!new Set(["eventsround.php", "eventsseason.php", "lookupevent.php", "lookupteam.php", "searchteams.php"]).has(cleanEndpoint)) {
    throw providerError("Невалиден TheSportsDB endpoint.", "THE_SPORTS_DB_INVALID_ENDPOINT", 400);
  }

  const state = options.state && typeof options.state === "object" ? options.state : {};
  const now = Number(options.now || Date.now());
  const usage = normalizeUsageState(state, now);
  if (usage.recentRequests.length >= THE_SPORTS_DB_MINUTE_BUDGET) {
    throw providerError(
      `Защитният лимит от ${THE_SPORTS_DB_MINUTE_BUDGET} TheSportsDB заявки в минута е достигнат. Опитай отново след малко.`,
      "THE_SPORTS_DB_MINUTE_GUARD",
      429
    );
  }

  const url = new URL(`${THE_SPORTS_DB_BASE_URL}/${cleanEndpoint}`);
  Object.entries(parameters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  usage.requests += 1;
  usage.recentRequests.push(now);
  usage.lastRequestAt = new Date(now).toISOString();

  let response;
  try {
    response = await (options.fetchImpl || fetch)(url, { headers: { Accept: "application/json" } });
  } catch {
    throw providerError("TheSportsDB временно не е достъпен.", "THE_SPORTS_DB_NETWORK_ERROR");
  }

  if (response.status === 429) {
    throw providerError(
      "TheSportsDB ограничи заявките. Изчакай една минута и опитай отново.",
      "THE_SPORTS_DB_RATE_LIMITED",
      429
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw providerError(`TheSportsDB върна грешка ${response.status}.`, "THE_SPORTS_DB_REQUEST_FAILED");
  }

  return {
    events: Array.isArray(payload.events) ? payload.events : [],
    teams: Array.isArray(payload.teams) ? payload.teams : [],
    usage: theSportsDbUsageSummary(state, now)
  };
}

module.exports = {
  THE_SPORTS_DB_BASE_URL,
  THE_SPORTS_DB_MINUTE_BUDGET,
  normalizeUsageState,
  requestTheSportsDb,
  theSportsDbUsageSummary,
  usageDay
};
