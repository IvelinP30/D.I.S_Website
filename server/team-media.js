const TEAM_CATALOG_MAX_ITEMS = 1000;
const TEAM_SEARCH_CACHE_MAX_ITEMS = 500;

const searchAliases = Object.freeze({
  "англия": "england",
  "аржентина": "argentina",
  "барселона": "barcelona",
  "бразилия": "brazil",
  "българия": "bulgaria",
  "германия": "germany",
  "испания": "spain",
  "италия": "italy",
  "манчестър сити": "manchester city",
  "манчестър юнайтед": "manchester united",
  "нидерландия": "netherlands",
  "португалия": "portugal",
  "реал мадрид": "real madrid",
  "франция": "france"
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

function safeTeamLogo(value = "") {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    const allowed = url.hostname === "r2.thesportsdb.com"
      || url.hostname === "www.thesportsdb.com"
      || url.hostname === "media.api-sports.io";
    return allowed ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeTeamMedia(value = {}) {
  if (!value || typeof value !== "object") return null;
  const id = Number(value.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const explicitLogo = safeTeamLogo(value.logo);
  const legacyApiFootball = String(value.source || "") === "API-Football" || (!explicitLogo && value.logo === undefined);
  const logo = explicitLogo || (legacyApiFootball ? `https://media.api-sports.io/football/teams/${id}.png` : "");
  if (!logo) return null;
  return {
    id,
    name: String(value.name || "").trim().slice(0, 120),
    code: String(value.code || "").trim().slice(0, 12),
    country: String(value.country || "").trim().slice(0, 80),
    national: Boolean(value.national),
    logo,
    source: legacyApiFootball && !explicitLogo.includes("thesportsdb.com") ? "API-Football" : "TheSportsDB",
    resolvedAt: String(value.resolvedAt || new Date().toISOString())
  };
}

function theSportsDbTeamMedia(team = {}, resolvedAt = new Date().toISOString()) {
  return normalizeTeamMedia({
    id: team.idTeam || team.id,
    name: team.strTeam || team.name,
    code: team.strTeamShort || team.code,
    country: team.strCountry || team.country,
    national: team.strTeamType === "National" || team.national === true,
    logo: team.strBadge || team.logo,
    source: "TheSportsDB",
    resolvedAt
  });
}

function eventTeamMedia(event = {}, side = "home", resolvedAt = new Date().toISOString()) {
  const home = side === "home";
  return theSportsDbTeamMedia({
    idTeam: home ? event.idHomeTeam : event.idAwayTeam,
    strTeam: home ? event.strHomeTeam : event.strAwayTeam,
    strBadge: home ? event.strHomeTeamBadge : event.strAwayTeamBadge,
    strCountry: event.strCountry
  }, resolvedAt);
}

function catalogTeams(cache = {}) {
  cache.teams ||= {};
  for (const entry of Object.values(cache.searches || {})) {
    for (const candidate of Array.isArray(entry?.results) ? entry.results : []) {
      const media = normalizeTeamMedia(candidate);
      if (media) cache.teams[String(media.id)] = media;
    }
  }
  return cache.teams;
}

function rememberTeamMedia(cache = {}, values = []) {
  const teams = catalogTeams(cache);
  for (const value of values) {
    const media = normalizeTeamMedia(value);
    if (media) teams[String(media.id)] = media;
  }
  const ordered = Object.values(teams)
    .sort((left, right) => Date.parse(right.resolvedAt || "") - Date.parse(left.resolvedAt || ""))
    .slice(0, TEAM_CATALOG_MAX_ITEMS);
  cache.teams = Object.fromEntries(ordered.map((team) => [String(team.id), team]));
  return cache;
}

function rememberTeamsFromEvents(cache = {}, events = [], resolvedAt = new Date().toISOString()) {
  const media = events.flatMap((event) => [
    eventTeamMedia(event, "home", resolvedAt),
    eventTeamMedia(event, "away", resolvedAt)
  ]).filter(Boolean);
  return rememberTeamMedia(cache, media);
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
  const normalized = normalizeTeamSearch(query);
  const translated = searchAliases[normalized] || transliterateTeamSearch(normalized);
  const candidates = [team.name, team.code, team.country]
    .flatMap((value) => [normalizeTeamSearch(value), transliterateTeamSearch(value)])
    .filter(Boolean);
  return Math.min(...candidates.map((candidate) => {
    if (candidate === translated || candidate === normalized) return 0;
    if (candidate.startsWith(translated) || translated.startsWith(candidate)) return 1;
    if (candidate.includes(translated) || translated.includes(candidate)) return 2;
    return 3 + levenshtein(candidate, translated) / Math.max(candidate.length, translated.length, 1);
  }));
}

function searchTeamMediaCatalog(query, options = {}) {
  const cleanQuery = String(query || "").trim().slice(0, 80);
  if (normalizeTeamSearch(cleanQuery).length < 3) throw new Error("Въведи поне 3 символа за търсене.");
  const cache = options.cache && typeof options.cache === "object" ? options.cache : {};
  const results = Object.values(catalogTeams(cache))
    .map(normalizeTeamMedia)
    .filter(Boolean)
    .map((team) => ({ team, score: teamSearchScore(team, cleanQuery) }))
    .filter(({ score }) => score < 3.75)
    .sort((left, right) => left.score - right.score || left.team.name.localeCompare(right.team.name, "bg"))
    .slice(0, 8)
    .map(({ team }) => team);
  return { results, cache, cacheHit: true, catalogSize: Object.keys(cache.teams || {}).length };
}

function cachedTeamMediaSearch(cache = {}, query = "") {
  const key = normalizeTeamSearch(query);
  const entry = cache.searches?.[key];
  if (!entry || !Array.isArray(entry.results)) return null;
  return entry.results.map(normalizeTeamMedia).filter(Boolean);
}

function rememberTeamMediaSearch(cache = {}, query = "", values = [], resolvedAt = new Date().toISOString()) {
  const key = normalizeTeamSearch(query);
  const results = values.map(normalizeTeamMedia).filter(Boolean);
  rememberTeamMedia(cache, results);
  cache.searches ||= {};
  cache.searches[key] = { results, resolvedAt };
  cache.searches = Object.fromEntries(Object.entries(cache.searches)
    .sort(([, left], [, right]) => Date.parse(right?.resolvedAt || "") - Date.parse(left?.resolvedAt || ""))
    .slice(0, TEAM_SEARCH_CACHE_MAX_ITEMS));
  return results;
}

module.exports = {
  TEAM_CATALOG_MAX_ITEMS,
  TEAM_SEARCH_CACHE_MAX_ITEMS,
  cachedTeamMediaSearch,
  eventTeamMedia,
  normalizeTeamMedia,
  normalizeTeamSearch,
  rememberTeamMedia,
  rememberTeamMediaSearch,
  rememberTeamsFromEvents,
  safeTeamLogo,
  searchTeamMediaCatalog,
  theSportsDbTeamMedia,
  transliterateTeamSearch
};
