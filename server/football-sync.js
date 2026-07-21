const { normalizeTeamMedia } = require("./team-media");

const DEFAULT_SYNC_DAYS = 7;
const SCHEDULE_SYNC_INTERVAL = 20 * 60 * 60 * 1000;
const RESULT_RECHECK_INTERVAL = 25 * 60 * 1000;
const RESULT_CHECK_DELAY = 100 * 60 * 1000;
const RESULT_CHECK_MAX_AGE = 72 * 60 * 60 * 1000;
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
const REGULATION_RESULT_STATUSES = new Set(["FT", "ET", "BT", "P", "AET", "PEN"]);
const CANCELLED_STATUSES = new Set(["CANC", "ABD", "AWD", "WO"]);
const NEW_FIXTURE_STATUSES = new Set(["TBD", "NS", "PST"]);

function normalizeFootballSettings(value = {}) {
  const leagueId = Number(value.leagueId);
  const season = Number(value.season);
  return {
    enabled: value.enabled === true,
    leagueId: Number.isInteger(leagueId) && leagueId > 0 ? leagueId : null,
    season: Number.isInteger(season) && season >= 2000 && season <= 2100 ? season : null,
    daysAhead: Math.max(1, Math.min(14, Number(value.daysAhead) || DEFAULT_SYNC_DAYS)),
    lastScheduleSyncAt: String(value.lastScheduleSyncAt || ""),
    lastResultSyncAt: String(value.lastResultSyncAt || "")
  };
}

function rawLeagues(predictionLeague = {}) {
  return Array.isArray(predictionLeague.leagues)
    ? predictionLeague.leagues
    : [predictionLeague];
}

function rawLeagueId(league = {}, index = 0) {
  return String(league.id || (index === 0 ? "general" : `league-${index + 1}`));
}

function zonedDate(now, daysAhead = 0, timeZone = "Europe/Sofia") {
  const date = new Date(Number(now) + Number(daysAhead) * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function apiTeamMedia(team = {}, resolvedAt = new Date().toISOString()) {
  return normalizeTeamMedia({
    id: team.id,
    name: team.name,
    code: team.code,
    country: team.country,
    national: team.national,
    resolvedAt
  });
}

function apiFixtureStatus(item = {}) {
  return String(item.fixture?.status?.short || "").trim().toUpperCase();
}

function apiFixtureResult(item = {}) {
  if (!REGULATION_RESULT_STATUSES.has(apiFixtureStatus(item))) return null;
  const rawHomeScore = item.score?.fulltime?.home;
  const rawAwayScore = item.score?.fulltime?.away;
  if (rawHomeScore === null || rawHomeScore === undefined || rawHomeScore === "" || rawAwayScore === null || rawAwayScore === undefined || rawAwayScore === "") return null;
  const homeScore = Number(rawHomeScore);
  const awayScore = Number(rawAwayScore);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 30 || awayScore > 30) return null;
  return { homeScore, awayScore };
}

function fixtureCompetition(item = {}, fallback = "D.I.S Matchday") {
  return [item.league?.name, item.league?.round].map((value) => String(value || "").trim()).filter(Boolean).join(" · ") || fallback;
}

function sameTeamsAndKickoff(match = {}, item = {}) {
  const apiHomeId = Number(item.teams?.home?.id);
  const apiAwayId = Number(item.teams?.away?.id);
  const mediaMatch = Number(match.homeTeamMedia?.id) === apiHomeId && Number(match.awayTeamMedia?.id) === apiAwayId;
  const name = (value) => String(value || "").trim().toLocaleLowerCase("en");
  const nameMatch = name(match.homeTeam) === name(item.teams?.home?.name) && name(match.awayTeam) === name(item.teams?.away?.name);
  const existingKickoff = Date.parse(match.kickoffAt || "");
  const apiKickoff = Date.parse(item.fixture?.date || "");
  const closeKickoff = Number.isFinite(existingKickoff) && Number.isFinite(apiKickoff) && Math.abs(existingKickoff - apiKickoff) <= 6 * 60 * 60 * 1000;
  return closeKickoff && (mediaMatch || nameMatch);
}

function mergeFixture(match, item, now = Date.now()) {
  const syncedAt = new Date(now).toISOString();
  const status = apiFixtureStatus(item);
  const apiResult = apiFixtureResult(item);
  const manualResult = match.manualResult === true || Boolean(match.result && match.resultSource !== "API-Football");
  const apiDetailsLocked = match.apiDetailsLocked === true;
  return {
    ...match,
    id: String(match.id || `api-fixture-${item.fixture.id}`),
    enabled: match.enabled !== false,
    competition: apiDetailsLocked ? String(match.competition || "D.I.S Matchday") : fixtureCompetition(item, match.competition),
    homeTeam: apiDetailsLocked ? String(match.homeTeam || "Отбор A") : String(item.teams?.home?.name || match.homeTeam || "Отбор A"),
    awayTeam: apiDetailsLocked ? String(match.awayTeam || "Отбор B") : String(item.teams?.away?.name || match.awayTeam || "Отбор B"),
    homeTeamMedia: apiDetailsLocked ? (match.homeTeamMedia || null) : apiTeamMedia(item.teams?.home, syncedAt) || match.homeTeamMedia || null,
    awayTeamMedia: apiDetailsLocked ? (match.awayTeamMedia || null) : apiTeamMedia(item.teams?.away, syncedAt) || match.awayTeamMedia || null,
    kickoffAt: apiDetailsLocked ? String(match.kickoffAt || "") : String(item.fixture?.date || match.kickoffAt || ""),
    isDerby: Boolean(match.isDerby),
    apiDetailsLocked,
    apiFixtureId: Number(item.fixture?.id),
    apiStatus: status,
    apiSyncedAt: syncedAt,
    result: manualResult ? (match.result || null) : (apiResult || match.result || null),
    resultSource: manualResult ? "manual" : apiResult ? "API-Football" : String(match.resultSource || ""),
    manualResult,
    settledAt: manualResult
      ? String(match.settledAt || "")
      : apiResult
        ? String(match.settledAt || syncedAt)
        : String(match.settledAt || "")
  };
}

function mergeLeagueSchedule(league = {}, fixtures = [], now = Date.now()) {
  const matches = Array.isArray(league.matches) ? league.matches.map((match) => ({ ...match })) : [];
  let added = 0;
  let updated = 0;
  for (const item of fixtures) {
    const fixtureId = Number(item.fixture?.id);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) continue;
    let index = matches.findIndex((match) => Number(match.apiFixtureId) === fixtureId);
    if (index < 0) index = matches.findIndex((match) => !match.apiFixtureId && sameTeamsAndKickoff(match, item));
    if (index >= 0) {
      matches[index] = mergeFixture(matches[index], item, now);
      updated += 1;
      continue;
    }
    if (!NEW_FIXTURE_STATUSES.has(apiFixtureStatus(item))) continue;
    matches.push(mergeFixture({
      id: `api-fixture-${fixtureId}`,
      enabled: true,
      isDerby: false,
      result: null,
      settledAt: "",
      resultSource: "",
      manualResult: false,
      apiDetailsLocked: false
    }, item, now));
    added += 1;
  }
  matches.sort((left, right) => {
    const leftTime = Date.parse(left.kickoffAt || "");
    const rightTime = Date.parse(right.kickoffAt || "");
    if (!Number.isFinite(leftTime)) return 1;
    if (!Number.isFinite(rightTime)) return -1;
    return leftTime - rightTime;
  });
  league.matches = matches;
  return { added, updated };
}

function dueResultMatches(predictionLeague = {}, now = Date.now(), selectedLeagueId = "") {
  return rawLeagues(predictionLeague).flatMap((league, index) => {
    const leagueId = rawLeagueId(league, index);
    if (selectedLeagueId && leagueId !== selectedLeagueId) return [];
    return (Array.isArray(league.matches) ? league.matches : [])
      .filter((match) => {
        if (!Number.isInteger(Number(match.apiFixtureId)) || match.result || match.manualResult === true) return false;
        if (CANCELLED_STATUSES.has(String(match.apiStatus || "").toUpperCase()) || String(match.apiStatus || "").toUpperCase() === "PST") return false;
        const kickoff = Date.parse(match.kickoffAt || "");
        if (!Number.isFinite(kickoff) || now - kickoff < RESULT_CHECK_DELAY || now - kickoff > RESULT_CHECK_MAX_AGE) return false;
        const checkedAt = Date.parse(match.apiSyncedAt || "");
        return !Number.isFinite(checkedAt) || now - checkedAt >= RESULT_RECHECK_INTERVAL;
      })
      .map((match) => ({ leagueId, match }));
  });
}

function applyFixtureResults(predictionLeague = {}, fixtures = [], now = Date.now()) {
  const byId = new Map(fixtures.map((item) => [Number(item.fixture?.id), item]));
  const summary = { checked: 0, settled: 0, rescheduled: 0, cancelled: 0 };
  rawLeagues(predictionLeague).forEach((league) => {
    (Array.isArray(league.matches) ? league.matches : []).forEach((match, index) => {
      const item = byId.get(Number(match.apiFixtureId));
      if (!item) return;
      const previousKickoff = String(match.kickoffAt || "");
      const next = mergeFixture(match, item, now);
      league.matches[index] = next;
      summary.checked += 1;
      if (!match.result && next.result) summary.settled += 1;
      if (previousKickoff && next.kickoffAt && previousKickoff !== next.kickoffAt) summary.rescheduled += 1;
      if (CANCELLED_STATUSES.has(next.apiStatus)) summary.cancelled += 1;
    });
  });
  return summary;
}

function chunk(values, size = 20) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function synchronizeFootballContent(content = {}, options = {}) {
  const now = Number(options.now || Date.now());
  const nextContent = structuredClone(content);
  nextContent.predictionLeague ||= {};
  const summary = { leagues: 0, added: 0, updated: 0, checked: 0, settled: 0, rescheduled: 0, cancelled: 0, apiCalls: 0 };
  const selectedLeagueId = String(options.leagueId || "");
  const leagues = rawLeagues(nextContent.predictionLeague);

  for (let index = 0; index < leagues.length; index += 1) {
    const league = leagues[index];
    const leagueId = rawLeagueId(league, index);
    if (selectedLeagueId && leagueId !== selectedLeagueId) continue;
    const settings = normalizeFootballSettings(league.apiFootball);
    league.apiFootball = settings;
    if (!settings.enabled || !settings.leagueId || !settings.season) continue;
    summary.leagues += 1;
    const lastSync = Date.parse(settings.lastScheduleSyncAt || "");
    const scheduleDue = options.forceSchedule === true || !Number.isFinite(lastSync) || now - lastSync >= SCHEDULE_SYNC_INTERVAL;
    if (!scheduleDue) continue;
    const result = await options.request("/fixtures", {
      league: settings.leagueId,
      season: settings.season,
      from: zonedDate(now, 0),
      to: zonedDate(now, settings.daysAhead),
      timezone: "Europe/Sofia"
    });
    summary.apiCalls += 1;
    const merged = mergeLeagueSchedule(league, result.response, now);
    summary.added += merged.added;
    summary.updated += merged.updated;
    league.apiFootball.lastScheduleSyncAt = new Date(now).toISOString();
  }

  const due = dueResultMatches(nextContent.predictionLeague, now, selectedLeagueId);
  const fixtureIds = [...new Set(due.map(({ match }) => Number(match.apiFixtureId)))];
  for (const ids of chunk(fixtureIds, 20)) {
    const result = await options.request("/fixtures", { ids: ids.join("-") });
    summary.apiCalls += 1;
    const applied = applyFixtureResults(nextContent.predictionLeague, result.response, now);
    Object.keys(applied).forEach((key) => { summary[key] += applied[key]; });
  }
  if (fixtureIds.length) {
    const syncedAt = new Date(now).toISOString();
    leagues.forEach((league, index) => {
      const leagueId = rawLeagueId(league, index);
      if (selectedLeagueId && leagueId !== selectedLeagueId) return;
      if (normalizeFootballSettings(league.apiFootball).enabled) league.apiFootball.lastResultSyncAt = syncedAt;
    });
  }

  return { content: nextContent, summary, changed: summary.apiCalls > 0 };
}

module.exports = {
  CANCELLED_STATUSES,
  FINISHED_STATUSES,
  RESULT_CHECK_DELAY,
  SCHEDULE_SYNC_INTERVAL,
  apiFixtureResult,
  applyFixtureResults,
  dueResultMatches,
  mergeLeagueSchedule,
  normalizeFootballSettings,
  synchronizeFootballContent,
  zonedDate
};
