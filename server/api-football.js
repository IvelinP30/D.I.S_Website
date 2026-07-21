const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const API_FOOTBALL_DAILY_BUDGET = 70;
const API_FOOTBALL_MINUTE_BUDGET = 6;

function apiFootballDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function normalizeUsageState(state = {}, now = Date.now()) {
  state.usage ||= {};
  const day = apiFootballDay(now);
  if (state.usage.day !== day) {
    state.usage = {
      day,
      requests: 0,
      recentRequests: [],
      upstreamLimit: null,
      upstreamRemaining: null,
      lastRequestAt: ""
    };
  }
  state.usage.requests = Math.max(0, Number(state.usage.requests) || 0);
  state.usage.recentRequests = (Array.isArray(state.usage.recentRequests) ? state.usage.recentRequests : [])
    .map(Number)
    .filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < 60_000);
  return state.usage;
}

function apiFootballUsageSummary(state = {}, now = Date.now()) {
  const usage = normalizeUsageState(state, now);
  const upstreamRemaining = usage.upstreamRemaining === null || usage.upstreamRemaining === undefined
    ? null
    : Number(usage.upstreamRemaining);
  const upstreamLimit = usage.upstreamLimit === null || usage.upstreamLimit === undefined
    ? null
    : Number(usage.upstreamLimit);
  const localRemaining = Math.max(0, API_FOOTBALL_DAILY_BUDGET - usage.requests);
  return {
    day: usage.day,
    used: usage.requests,
    localLimit: API_FOOTBALL_DAILY_BUDGET,
    localRemaining,
    minuteUsed: usage.recentRequests.length,
    minuteLimit: API_FOOTBALL_MINUTE_BUDGET,
    upstreamLimit: Number.isFinite(upstreamLimit) && upstreamLimit > 0 ? upstreamLimit : null,
    upstreamRemaining: Number.isFinite(upstreamRemaining) && upstreamRemaining >= 0 ? upstreamRemaining : null,
    remaining: Number.isFinite(upstreamRemaining) && upstreamRemaining >= 0
      ? Math.min(localRemaining, upstreamRemaining)
      : localRemaining,
    lastRequestAt: String(usage.lastRequestAt || "")
  };
}

function apiFootballError(message, code, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function apiErrorMessage(errors) {
  if (!errors) return "";
  if (typeof errors === "string") return errors;
  if (Array.isArray(errors)) return errors.filter(Boolean).join(" ");
  if (typeof errors === "object") return Object.values(errors).filter(Boolean).join(" ");
  return "";
}

function headerNumber(response, name) {
  const rawValue = response?.headers?.get?.(name);
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

async function requestApiFootball(endpoint, parameters = {}, options = {}) {
  if (!options.apiKey) {
    throw apiFootballError(
      "API-Football не е конфигуриран. Добави API_FOOTBALL_KEY в environment variables.",
      "API_FOOTBALL_NOT_CONFIGURED",
      503
    );
  }
  const cleanEndpoint = `/${String(endpoint || "").replace(/^\/+/, "")}`;
  if (!/^\/[a-z0-9/-]+$/i.test(cleanEndpoint)) {
    throw apiFootballError("Невалиден API-Football endpoint.", "API_FOOTBALL_INVALID_ENDPOINT", 400);
  }

  const state = options.state && typeof options.state === "object" ? options.state : {};
  const now = Number(options.now || Date.now());
  const usage = normalizeUsageState(state, now);
  if (usage.requests >= API_FOOTBALL_DAILY_BUDGET) {
    throw apiFootballError(
      `Дневният защитен лимит от ${API_FOOTBALL_DAILY_BUDGET} API-Football заявки е достигнат.`,
      "API_FOOTBALL_DAILY_GUARD",
      429
    );
  }
  if (usage.upstreamRemaining === 0) {
    throw apiFootballError(
      "API-Football дневната квота е изчерпана. Автоматизацията ще опита отново утре.",
      "API_FOOTBALL_UPSTREAM_GUARD",
      429
    );
  }
  if (usage.recentRequests.length >= API_FOOTBALL_MINUTE_BUDGET) {
    throw apiFootballError(
      "Защитният лимит от 6 API-Football заявки в минута е достигнат. Опитай отново след малко.",
      "API_FOOTBALL_MINUTE_GUARD",
      429
    );
  }

  const url = new URL(cleanEndpoint, API_FOOTBALL_BASE_URL);
  Object.entries(parameters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  usage.requests += 1;
  usage.recentRequests.push(now);
  usage.lastRequestAt = new Date(now).toISOString();

  let response;
  try {
    response = await (options.fetchImpl || fetch)(url, {
      headers: { Accept: "application/json", "x-apisports-key": options.apiKey }
    });
  } catch {
    throw apiFootballError("API-Football временно не е достъпен.", "API_FOOTBALL_NETWORK_ERROR");
  }

  const upstreamLimit = headerNumber(response, "x-ratelimit-requests-limit");
  const upstreamRemaining = headerNumber(response, "x-ratelimit-requests-remaining");
  if (upstreamLimit !== null) usage.upstreamLimit = upstreamLimit;
  if (upstreamRemaining !== null) usage.upstreamRemaining = upstreamRemaining;

  const payload = await response.json().catch(() => ({}));
  const errorMessage = apiErrorMessage(payload.errors);
  if (!response.ok || errorMessage) {
    const suspended = /suspend/i.test(errorMessage);
    const rateLimited = response.status === 429 || /rate.?limit|too many requests/i.test(errorMessage);
    throw apiFootballError(
      suspended
        ? "API-Football акаунтът е спрян. Провери известията и Request logs в dashboard-а."
        : rateLimited
          ? "API-Football ограничи заявките. Автоматизацията ще опита отново по-късно."
          : errorMessage || `API-Football върна грешка ${response.status}.`,
      suspended ? "API_FOOTBALL_SUSPENDED" : rateLimited ? "API_FOOTBALL_RATE_LIMITED" : "API_FOOTBALL_REQUEST_FAILED",
      suspended ? 503 : rateLimited ? 429 : 502
    );
  }

  return {
    response: Array.isArray(payload.response) ? payload.response : [],
    paging: payload.paging || { current: 1, total: 1 },
    usage: apiFootballUsageSummary(state, now)
  };
}

module.exports = {
  API_FOOTBALL_BASE_URL,
  API_FOOTBALL_DAILY_BUDGET,
  API_FOOTBALL_MINUTE_BUDGET,
  apiFootballDay,
  apiFootballUsageSummary,
  normalizeUsageState,
  requestApiFootball
};
