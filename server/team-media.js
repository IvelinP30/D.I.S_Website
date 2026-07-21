const { API_FOOTBALL_BASE_URL } = require("./api-football");
const API_FOOTBALL_MEDIA_ORIGIN = "https://media.api-sports.io";
const TEAM_SEARCH_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

const searchAliases = Object.freeze({
  "англия": "England",
  "аржентина": "Argentina",
  "барселона": "Barcelona",
  "бразилия": "Brazil",
  "българия": "Bulgaria",
  "германия": "Germany",
  "испани": "Spain",
  "испания": "Spain",
  "италия": "Italy",
  "манчестър сити": "Manchester City",
  "манчестър юнайтед": "Manchester United",
  "нидерландия": "Netherlands",
  "португалия": "Portugal",
  "реал мадрид": "Real Madrid",
  "франция": "France"
});

const transliteration = Object.freeze({
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "", ю: "yu", я: "ya"
});

function normalizeTeamSearch(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function transliterateTeamSearch(value = "") {
  return normalizeTeamSearch(value)
    .split("")
    .map((character) => transliteration[character] ?? character)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function apiFootballSearchTerms(query = "") {
  const normalized = normalizeTeamSearch(query);
  const preferred = searchAliases[normalized] || transliterateTeamSearch(normalized);
  return [preferred].map((term) => term.trim()).filter((term) => term.length >= 3).slice(0, 1);
}

function levenshtein(left = "", right = "") {
  const first = String(left);
  const second = String(right);
  const row = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let diagonal = row[0];
    row[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const previous = row[secondIndex];
      row[secondIndex] = Math.min(
        row[secondIndex] + 1,
        row[secondIndex - 1] + 1,
        diagonal + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return row[second.length];
}

function teamSearchScore(team, query) {
  const normalizedQuery = normalizeTeamSearch(searchAliases[normalizeTeamSearch(query)] || transliterateTeamSearch(query));
  const candidates = [team.name, team.code, team.country].map((value) => normalizeTeamSearch(value)).filter(Boolean);
  return Math.min(...candidates.map((candidate) => {
    if (candidate === normalizedQuery) return 0;
    if (candidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(candidate)) return 1;
    if (candidate.includes(normalizedQuery) || normalizedQuery.includes(candidate)) return 2;
    return 3 + levenshtein(candidate, normalizedQuery) / Math.max(candidate.length, normalizedQuery.length, 1);
  }));
}

function normalizeTeamMedia(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = Number(value.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    name: String(value.name || "").trim().slice(0, 120),
    code: String(value.code || "").trim().slice(0, 12),
    country: String(value.country || "").trim().slice(0, 80),
    national: Boolean(value.national),
    logo: `${API_FOOTBALL_MEDIA_ORIGIN}/football/teams/${id}.png`,
    source: "API-Football",
    resolvedAt: String(value.resolvedAt || new Date().toISOString())
  };
}

function normalizeApiTeam(item = {}) {
  return normalizeTeamMedia({
    id: item.team?.id,
    name: item.team?.name,
    code: item.team?.code,
    country: item.team?.country,
    national: item.team?.national,
    resolvedAt: new Date().toISOString()
  });
}

async function fetchApiFootballTeams(term, apiKey, fetchImpl, requestImpl) {
  if (requestImpl) {
    const payload = await requestImpl(term);
    return (Array.isArray(payload?.response) ? payload.response : []).map(normalizeApiTeam).filter(Boolean);
  }
  const url = new URL("/teams", API_FOOTBALL_BASE_URL);
  url.searchParams.set("search", term);
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "x-apisports-key": apiKey }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`API-Football върна грешка ${response.status}.`);
  const apiErrors = payload.errors && (Array.isArray(payload.errors) ? payload.errors.length : Object.keys(payload.errors).length);
  if (apiErrors) throw new Error("API-Football не прие заявката.");
  return (Array.isArray(payload.response) ? payload.response : []).map(normalizeApiTeam).filter(Boolean);
}

async function searchApiFootballTeams(query, options = {}) {
  const cleanQuery = String(query || "").trim().slice(0, 80);
  if (normalizeTeamSearch(cleanQuery).length < 3) throw new Error("Въведи поне 3 символа за търсене.");
  if (!options.apiKey) {
    const error = new Error("API-Football не е конфигуриран. Добави API_FOOTBALL_KEY в environment variables.");
    error.code = "API_FOOTBALL_NOT_CONFIGURED";
    throw error;
  }

  const now = Number(options.now || Date.now());
  const cache = options.cache && typeof options.cache === "object" ? options.cache : {};
  cache.searches ||= {};
  const terms = apiFootballSearchTerms(cleanQuery);
  const cacheKey = normalizeTeamSearch(terms[0] || cleanQuery);
  const cached = cache.searches[cacheKey];
  if (cached && Number(cached.expiresAt) > now && Array.isArray(cached.results)) {
    return { results: cached.results.map(normalizeTeamMedia).filter(Boolean), cache, cacheHit: true };
  }

  let results = [];
  let lastError = null;
  for (const term of terms) {
    try {
      results = await fetchApiFootballTeams(term, options.apiKey, options.fetchImpl || fetch, options.requestImpl);
      if (results.length) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!results.length && lastError) {
    if (cached?.results?.length) return { results: cached.results.map(normalizeTeamMedia).filter(Boolean), cache, cacheHit: true, stale: true };
    throw lastError;
  }

  results = [...new Map(results.map((team) => [team.id, team])).values()]
    .sort((left, right) => teamSearchScore(left, cleanQuery) - teamSearchScore(right, cleanQuery))
    .slice(0, 8);
  cache.searches[cacheKey] = {
    query: cleanQuery,
    cachedAt: new Date(now).toISOString(),
    expiresAt: now + TEAM_SEARCH_CACHE_TTL,
    results
  };
  return { results, cache, cacheHit: false };
}

module.exports = {
  API_FOOTBALL_BASE_URL,
  TEAM_SEARCH_CACHE_TTL,
  apiFootballSearchTerms,
  normalizeTeamMedia,
  normalizeTeamSearch,
  searchApiFootballTeams,
  transliterateTeamSearch
};
