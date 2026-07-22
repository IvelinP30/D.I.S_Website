const { eventTeamMedia, transliterateTeamSearch } = require("./team-media");

const DEFAULT_SYNC_DAYS = 14;
const SCHEDULE_SYNC_INTERVAL = 20 * 60 * 60 * 1000;
const RESULT_RECHECK_INTERVAL = 25 * 60 * 1000;
const RESULT_CHECK_DELAY = 100 * 60 * 1000;
const RESULT_CHECK_MAX_AGE = 21 * 24 * 60 * 60 * 1000;
const SETTLED_MATCH_ARCHIVE_DELAY = 24 * 60 * 60 * 1000;
const ESTIMATED_MATCH_DURATION = 2 * 60 * 60 * 1000;
const FINISHED_STATUSES = new Set(["FT"]);
const CANCELLED_STATUSES = new Set(["CANC", "CANCELLED", "ABD", "AWD", "WO"]);
const POSTPONED_STATUSES = new Set(["PST", "POSTPONED"]);
const NEW_FIXTURE_STATUSES = new Set(["", "NS", "TBD"]);

function normalizeSeason(value, fallback = "") {
  const clean = String(value || fallback || "").trim();
  if (/^\d{4}-\d{4}$/.test(clean)) return clean;
  if (/^\d{4}$/.test(clean)) return `${clean}-${Number(clean) + 1}`;
  return "";
}

function normalizeFootballSettings(value = {}) {
  const source = value.theSportsDb && typeof value.theSportsDb === "object" ? value.theSportsDb : value;
  const leagueId = Number(source.leagueId);
  const currentRound = Number(source.currentRound || 1);
  return {
    enabled: source.enabled === true,
    leagueId: Number.isInteger(leagueId) && leagueId > 0 ? leagueId : null,
    season: normalizeSeason(source.season),
    currentRound: Number.isInteger(currentRound) ? Math.max(1, Math.min(100, currentRound)) : 1,
    daysAhead: Math.max(1, Math.min(14, Number(source.daysAhead) || DEFAULT_SYNC_DAYS)),
    lastScheduleSyncAt: String(source.lastScheduleSyncAt || ""),
    lastResultSyncAt: String(source.lastResultSyncAt || "")
  };
}

function rawLeagues(predictionLeague = {}) {
  return Array.isArray(predictionLeague.leagues) ? predictionLeague.leagues : [predictionLeague];
}

function rawLeagueId(league = {}, index = 0) {
  return String(league.id || (index === 0 ? "general" : `league-${index + 1}`));
}

function zonedDate(now, daysAhead = 0, timeZone = "Europe/Sofia") {
  const date = new Date(Number(now) + Number(daysAhead) * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function eventStatus(item = {}) {
  if (String(item.strPostponed || "").toLowerCase() === "yes") return "PST";
  const status = String(item.strStatus || "").trim().toUpperCase();
  if (status === "POSTPONED") return "PST";
  if (status === "CANCELED" || status === "CANCELLED") return "CANC";
  return status;
}

function eventKickoff(item = {}) {
  const timestamp = String(item.strTimestamp || "").trim();
  if (timestamp) {
    const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
    const parsed = Date.parse(explicitZone ? timestamp : `${timestamp}Z`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const date = String(item.dateEvent || "").trim();
  const time = String(item.strTime || "00:00:00").trim() || "00:00:00";
  const parsed = Date.parse(`${date}T${time}Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function eventResult(item = {}) {
  if (!FINISHED_STATUSES.has(eventStatus(item))) return null;
  if (item.intHomeScoreExtra !== null && item.intHomeScoreExtra !== undefined && item.intHomeScoreExtra !== "") return null;
  if (item.intAwayScoreExtra !== null && item.intAwayScoreExtra !== undefined && item.intAwayScoreExtra !== "") return null;
  if (item.intHomeScore === null || item.intHomeScore === undefined || item.intHomeScore === "") return null;
  if (item.intAwayScore === null || item.intAwayScore === undefined || item.intAwayScore === "") return null;
  const homeScore = Number(item.intHomeScore);
  const awayScore = Number(item.intAwayScore);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 30 || awayScore > 30) return null;
  return { homeScore, awayScore };
}

function normalizedEvent(item = {}, now = Date.now()) {
  const externalEventId = Number(item.idEvent);
  if (!Number.isInteger(externalEventId) || externalEventId <= 0) return null;
  const round = Number(item.intRound);
  const syncedAt = new Date(now).toISOString();
  return {
    externalEventId,
    legacyApiFootballId: Number(item.idAPIfootball) || null,
    kickoffAt: eventKickoff(item),
    status: eventStatus(item),
    result: eventResult(item),
    round: Number.isInteger(round) && round > 0 ? round : null,
    competition: [item.strLeague, Number.isInteger(round) && round > 0 ? `Кръг ${round}` : ""].filter(Boolean).join(" · ") || "D.I.S Matchday",
    homeTeam: String(item.strHomeTeam || "Отбор A"),
    awayTeam: String(item.strAwayTeam || "Отбор B"),
    homeTeamMedia: eventTeamMedia(item, "home", syncedAt),
    awayTeamMedia: eventTeamMedia(item, "away", syncedAt),
    syncedAt
  };
}

function comparableTeamName(value = "") {
  return transliterateTeamSearch(value)
    .replace(/\btsska\b/g, "cska")
    .replace(/\btska\b/g, "cska")
    .replace(/\b(?:fc|pfc|pfk|fk)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamNameMatches(existingValues = [], providerValue = "") {
  const provider = comparableTeamName(providerValue);
  if (!provider) return false;
  return existingValues.some((value) => {
    const existing = comparableTeamName(value);
    if (!existing) return false;
    if (existing === provider) return true;
    const shorter = existing.length <= provider.length ? existing : provider;
    const longer = existing.length > provider.length ? existing : provider;
    return shorter.length >= 7 && (` ${longer} `).includes(` ${shorter} `);
  });
}

function sameTeamsAndKickoff(match = {}, event = {}) {
  const homeId = Number(event.homeTeamMedia?.id);
  const awayId = Number(event.awayTeamMedia?.id);
  const mediaMatch = Number(match.homeTeamMedia?.id) === homeId && Number(match.awayTeamMedia?.id) === awayId;
  const nameMatch = teamNameMatches([match.homeTeam, match.homeTeamMedia?.name], event.homeTeam)
    && teamNameMatches([match.awayTeam, match.awayTeamMedia?.name], event.awayTeam);
  const existingKickoff = Date.parse(match.kickoffAt || "");
  const nextKickoff = Date.parse(event.kickoffAt || "");
  const closeKickoff = Number.isFinite(existingKickoff) && Number.isFinite(nextKickoff) && Math.abs(existingKickoff - nextKickoff) <= 6 * 60 * 60 * 1000;
  return closeKickoff && (mediaMatch || nameMatch);
}

function mergeEvent(match, event) {
  const automaticSources = new Set(["API-Football", "TheSportsDB"]);
  const manualResult = match.manualResult === true || Boolean(match.result && !automaticSources.has(match.resultSource));
  const detailsLocked = match.externalDetailsLocked === true || match.apiDetailsLocked === true;
  return {
    ...match,
    id: String(match.id || `sports-event-${event.externalEventId}`),
    enabled: match.enabled !== false,
    competition: detailsLocked ? String(match.competition || "D.I.S Matchday") : event.competition,
    homeTeam: detailsLocked ? String(match.homeTeam || "Отбор A") : event.homeTeam,
    awayTeam: detailsLocked ? String(match.awayTeam || "Отбор B") : event.awayTeam,
    homeTeamMedia: detailsLocked ? (match.homeTeamMedia || null) : (event.homeTeamMedia || match.homeTeamMedia || null),
    awayTeamMedia: detailsLocked ? (match.awayTeamMedia || null) : (event.awayTeamMedia || match.awayTeamMedia || null),
    kickoffAt: detailsLocked ? String(match.kickoffAt || "") : (event.kickoffAt || match.kickoffAt || ""),
    isDerby: Boolean(match.isDerby),
    externalDetailsLocked: detailsLocked,
    apiDetailsLocked: detailsLocked,
    externalProvider: "TheSportsDB",
    externalEventId: event.externalEventId,
    externalRound: event.round,
    externalStatus: event.status,
    externalSyncedAt: event.syncedAt,
    legacyApiFootballId: event.legacyApiFootballId || match.legacyApiFootballId || match.apiFixtureId || null,
    result: manualResult ? (match.result || null) : (event.result || match.result || null),
    resultSource: manualResult ? "manual" : event.result ? "TheSportsDB" : String(match.resultSource || ""),
    manualResult,
    settledAt: manualResult ? String(match.settledAt || "") : event.result ? String(match.settledAt || event.syncedAt) : String(match.settledAt || "")
  };
}

function mergeLeagueSchedule(league = {}, rawEvents = [], now = Date.now(), options = {}) {
  const matches = Array.isArray(league.matches) ? league.matches.map((match) => ({ ...match })) : [];
  const maxKickoff = Number(options.maxKickoff || Number.POSITIVE_INFINITY);
  let added = 0;
  let updated = 0;
  for (const rawEvent of rawEvents) {
    const event = normalizedEvent(rawEvent, now);
    if (!event) continue;
    let index = matches.findIndex((match) => Number(match.externalEventId) === event.externalEventId);
    if (index < 0 && event.legacyApiFootballId) {
      index = matches.findIndex((match) => Number(match.apiFixtureId || match.legacyApiFootballId) === event.legacyApiFootballId);
    }
    if (index < 0) index = matches.findIndex((match) => !match.externalEventId && sameTeamsAndKickoff(match, event));
    if (index >= 0) {
      matches[index] = mergeEvent(matches[index], event);
      updated += 1;
      continue;
    }
    const kickoff = Date.parse(event.kickoffAt || "");
    if (Number.isFinite(maxKickoff) && (!Number.isFinite(kickoff) || kickoff > maxKickoff)) continue;
    if (!NEW_FIXTURE_STATUSES.has(event.status) && !event.result) continue;
    matches.push(mergeEvent({
      id: `sports-event-${event.externalEventId}`,
      enabled: true,
      isDerby: false,
      result: null,
      settledAt: "",
      resultSource: "",
      manualResult: false,
      externalDetailsLocked: false
    }, event));
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
    return (Array.isArray(league.matches) ? league.matches : []).filter((match) => {
      if (!Number.isInteger(Number(match.externalEventId)) || match.result || match.manualResult === true) return false;
      const status = String(match.externalStatus || "").toUpperCase();
      if (CANCELLED_STATUSES.has(status) || POSTPONED_STATUSES.has(status)) return false;
      const kickoff = Date.parse(match.kickoffAt || "");
      if (!Number.isFinite(kickoff) || now - kickoff < RESULT_CHECK_DELAY || now - kickoff > RESULT_CHECK_MAX_AGE) return false;
      const checkedAt = Date.parse(match.externalSyncedAt || "");
      return !Number.isFinite(checkedAt) || now - checkedAt >= RESULT_RECHECK_INTERVAL;
    }).map((match) => ({ leagueId, match }));
  });
}

function roundIsComplete(events = []) {
  return events.length > 0 && events.every((item) => FINISHED_STATUSES.has(eventStatus(item)) || CANCELLED_STATUSES.has(eventStatus(item)) || POSTPONED_STATUSES.has(eventStatus(item)));
}

function archiveExpiredSettledMatches(content = {}, now = Date.now()) {
  let archived = 0;
  for (const league of rawLeagues(content.predictionLeague || {})) {
    if (!normalizeFootballSettings(league.theSportsDb || {}).enabled) continue;
    const matches = Array.isArray(league.matches) ? league.matches : [];
    league.matches = matches.filter((match) => {
      if (!match.result) return true;
      const settledAt = Date.parse(match.settledAt || "");
      const kickoffAt = Date.parse(match.kickoffAt || "");
      const finishedAt = Number.isFinite(settledAt)
        ? settledAt
        : Number.isFinite(kickoffAt) ? kickoffAt + ESTIMATED_MATCH_DURATION : NaN;
      const expired = Number.isFinite(finishedAt) && Number(now) - finishedAt >= SETTLED_MATCH_ARCHIVE_DELAY;
      if (expired) archived += 1;
      return !expired;
    });
  }
  return archived;
}

async function synchronizeFootballContent(content = {}, options = {}) {
  const now = Number(options.now || Date.now());
  const nextContent = structuredClone(content);
  nextContent.predictionLeague ||= {};
  const summary = { leagues: 0, rounds: 0, added: 0, updated: 0, checked: 0, settled: 0, archived: 0, rescheduled: 0, cancelled: 0, advanced: 0, apiCalls: 0 };
  const selectedLeagueId = String(options.leagueId || "");
  const requestedRound = Number(options.round);
  const manualRequest = options.forceSchedule === true && Boolean(selectedLeagueId) && Number.isInteger(requestedRound) && requestedRound > 0;
  const leagues = rawLeagues(nextContent.predictionLeague);

  for (let index = 0; index < leagues.length; index += 1) {
    const league = leagues[index];
    const leagueId = rawLeagueId(league, index);
    if (selectedLeagueId && leagueId !== selectedLeagueId) continue;
    const settings = normalizeFootballSettings(league.theSportsDb || {});
    league.theSportsDb = settings;
    if ((!settings.enabled && !manualRequest) || !settings.leagueId || !settings.season) continue;
    summary.leagues += 1;
    const lastScheduleSync = Date.parse(settings.lastScheduleSyncAt || "");
    const scheduleDue = options.forceSchedule === true || !Number.isFinite(lastScheduleSync) || now - lastScheduleSync >= SCHEDULE_SYNC_INTERVAL;
    const dueResults = dueResultMatches({ leagues: [league] }, now).length > 0;
    if (!scheduleDue && !dueResults) continue;

    const resultRounds = dueResultMatches({ leagues: [league] }, now)
      .map(({ match }) => Number(match.externalRound))
      .filter((round) => Number.isInteger(round) && round > 0);
    const postponedRounds = (league.matches || [])
      .filter((match) => !match.result && POSTPONED_STATUSES.has(String(match.externalStatus || "").toUpperCase()))
      .map((match) => Number(match.externalRound))
      .filter((round) => Number.isInteger(round) && round > 0);
    const rounds = Number.isInteger(requestedRound) && requestedRound > 0
      ? [Math.min(100, requestedRound)]
      : scheduleDue
        ? [settings.currentRound, Math.min(100, settings.currentRound + 1), ...resultRounds, ...postponedRounds]
        : [settings.currentRound, ...resultRounds, ...postponedRounds];
    const uniqueRounds = [...new Set(rounds)];
    let currentRoundEvents = [];
    for (const round of uniqueRounds) {
      const response = await options.request("eventsround.php", { id: settings.leagueId, r: round, s: settings.season });
      summary.apiCalls += 1;
      summary.rounds += 1;
      const events = (Array.isArray(response.events) ? response.events : []).filter((event) => {
        const eventId = Number(event.idEvent);
        return !options.archivedEventKeys?.has(`${leagueId}:${eventId}`);
      });
      const eventIds = new Set(events.map((event) => Number(event.idEvent)).filter(Number.isInteger));
      if (round === settings.currentRound) currentRoundEvents = events;
      const before = new Map((league.matches || []).map((match) => [Number(match.externalEventId), { kickoffAt: match.kickoffAt, result: match.result }]));
      const merged = mergeLeagueSchedule(league, events, now, {
        maxKickoff: options.forceSchedule === true ? Number.POSITIVE_INFINITY : now + settings.daysAhead * 86_400_000
      });
      summary.added += merged.added;
      summary.updated += merged.updated;
      for (const match of league.matches || []) {
        if (!eventIds.has(Number(match.externalEventId))) continue;
        const previous = before.get(Number(match.externalEventId));
        if (!previous) continue;
        summary.checked += 1;
        if (!previous.result && match.result) summary.settled += 1;
        if (previous.kickoffAt && match.kickoffAt && previous.kickoffAt !== match.kickoffAt) summary.rescheduled += 1;
        if (CANCELLED_STATUSES.has(String(match.externalStatus || "").toUpperCase())) summary.cancelled += 1;
      }
    }

    const syncedAt = new Date(now).toISOString();
    if (scheduleDue) league.theSportsDb.lastScheduleSyncAt = syncedAt;
    if (dueResults || options.forceSchedule === true) league.theSportsDb.lastResultSyncAt = syncedAt;
    const requestedCurrentRound = Number.isInteger(requestedRound) && requestedRound === settings.currentRound;
    if ((!Number.isInteger(requestedRound) || requestedCurrentRound) && roundIsComplete(currentRoundEvents)) {
      league.theSportsDb.currentRound = Math.min(100, settings.currentRound + 1);
      summary.advanced += 1;
    }
  }

  summary.archived = archiveExpiredSettledMatches(nextContent, now);

  return { content: nextContent, summary, changed: summary.apiCalls > 0 || summary.archived > 0 };
}

module.exports = {
  CANCELLED_STATUSES,
  FINISHED_STATUSES,
  RESULT_CHECK_DELAY,
  SCHEDULE_SYNC_INTERVAL,
  SETTLED_MATCH_ARCHIVE_DELAY,
  archiveExpiredSettledMatches,
  dueResultMatches,
  eventKickoff,
  eventResult,
  eventStatus,
  mergeLeagueSchedule,
  normalizeFootballSettings,
  normalizeSeason,
  normalizedEvent,
  roundIsComplete,
  synchronizeFootballContent,
  zonedDate
};
