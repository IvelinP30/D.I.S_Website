const assert = require("node:assert/strict");
const test = require("node:test");
const {
  archiveExpiredSettledMatches,
  dueResultMatches,
  eventKickoff,
  eventResult,
  mergeLeagueSchedule,
  normalizeFootballSettings,
  roundIsComplete,
  synchronizeFootballContent,
  zonedDate
} = require("../server/football-sync");
const { requestTheSportsDb } = require("../server/the-sports-db");

const now = Date.parse("2026-08-24T20:00:00Z");

function sportsEvent(id, options = {}) {
  return {
    idEvent: String(id),
    idAPIfootball: options.apiFootballId ? String(options.apiFootballId) : null,
    strTimestamp: options.timestamp || "2026-08-25T19:30:00",
    strLeague: options.league || "English Premier League",
    intRound: String(options.round || 1),
    strHomeTeam: options.home || "Arsenal",
    strAwayTeam: options.away || "Chelsea",
    idHomeTeam: String(options.homeId || 133604),
    idAwayTeam: String(options.awayId || 133610),
    strHomeTeamBadge: options.homeLogo || "https://r2.thesportsdb.com/images/media/team/badge/arsenal.png",
    strAwayTeamBadge: options.awayLogo || "https://r2.thesportsdb.com/images/media/team/badge/chelsea.png",
    strCountry: "England",
    strStatus: options.status ?? "NS",
    strPostponed: options.postponed || "no",
    intHomeScore: options.homeScore ?? null,
    intAwayScore: options.awayScore ?? null,
    intHomeScoreExtra: options.homeExtra ?? null,
    intAwayScoreExtra: options.awayExtra ?? null
  };
}

test("normalizes free TheSportsDB league settings and Sofia date windows", () => {
  assert.deepEqual(normalizeFootballSettings({ enabled: true, leagueId: "4328", season: "2026", currentRound: "3", daysAhead: 30 }), {
    enabled: true,
    leagueId: 4328,
    season: "2026-2027",
    currentRound: 3,
    daysAhead: 14,
    lastScheduleSyncAt: "",
    lastResultSyncAt: ""
  });
  assert.equal(zonedDate(Date.parse("2026-07-22T22:30:00Z")), "2026-07-23");
  assert.equal(eventKickoff(sportsEvent(1)), "2026-08-25T19:30:00.000Z");
});

test("allows season event requests used by champion forecasts", async () => {
  const response = await requestTheSportsDb("eventsseason.php", { id: 4626, s: "2026-2027" }, {
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get("id"), "4626");
      assert.equal(url.searchParams.get("s"), "2026-2027");
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    }
  });

  assert.deepEqual(response.events, []);
});

test("legacy API-Football settings are not contacted as TheSportsDB league IDs", async () => {
  let calls = 0;
  const result = await synchronizeFootballContent({
    predictionLeague: { leagues: [{ id: "legacy", apiFootball: { enabled: true, leagueId: 39, season: 2026 }, matches: [] }] }
  }, {
    now,
    request: async () => { calls += 1; return { events: [] }; }
  });
  assert.equal(calls, 0);
  assert.equal(result.content.predictionLeague.leagues[0].theSportsDb.enabled, false);
});

test("imports a complete round once, keeps badge URLs, and updates schedule changes", () => {
  const league = { title: "Висша лига", matches: [] };
  const first = mergeLeagueSchedule(league, [sportsEvent(100)], now);
  const second = mergeLeagueSchedule(league, [sportsEvent(100, { timestamp: "2026-08-25T20:00:00" })], now + 1_000);

  assert.deepEqual(first, { added: 1, updated: 0 });
  assert.deepEqual(second, { added: 0, updated: 1 });
  assert.equal(league.matches.length, 1);
  assert.equal(league.matches[0].externalEventId, 100);
  assert.equal(league.matches[0].kickoffAt, "2026-08-25T20:00:00.000Z");
  assert.equal(league.matches[0].homeTeamMedia.logo, "https://r2.thesportsdb.com/images/media/team/badge/arsenal.png");
  assert.equal(league.matches[0].homeTeamMedia.source, "TheSportsDB");
});

test("migrates an existing API-Football fixture through TheSportsDB cross-provider ID", () => {
  const league = {
    matches: [{ id: "legacy", apiFixtureId: 1557367, homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffAt: "2026-08-25T19:30:00Z", result: null }]
  };
  mergeLeagueSchedule(league, [sportsEvent(101, { apiFootballId: 1557367 })], now);
  assert.equal(league.matches.length, 1);
  assert.equal(league.matches[0].id, "legacy");
  assert.equal(league.matches[0].externalEventId, 101);
  assert.equal(league.matches[0].legacyApiFootballId, 1557367);
});

test("links Cyrillic production matches through their legacy media names without changing prediction IDs", () => {
  const league = {
    matches: [{
      id: "keep-this-prediction-id",
      homeTeam: "ЧЕРНО МОРЕ",
      awayTeam: "СПАРТАК ВАРНА",
      homeTeamMedia: { id: 851, name: "Cherno More Varna", source: "API-Football" },
      awayTeamMedia: { id: 4660, name: "Spartak Varna", source: "API-Football" },
      kickoffAt: "2026-07-26T16:00:00.000Z",
      result: null,
      isDerby: true
    }]
  };
  mergeLeagueSchedule(league, [sportsEvent(2487278, {
    timestamp: "2026-07-26T16:00:00",
    round: 2,
    home: "Cherno More",
    away: "Spartak Varna",
    homeId: 137915,
    awayId: 142832
  })], now);

  assert.equal(league.matches.length, 1);
  assert.equal(league.matches[0].id, "keep-this-prediction-id");
  assert.equal(league.matches[0].externalEventId, 2487278);
  assert.equal(league.matches[0].isDerby, true);
});

test("settles only safe FT scores and never overwrites a manual result", () => {
  const league = {
    matches: [
      { id: "a", externalEventId: 200, kickoffAt: "2026-08-24T16:00:00Z", result: null },
      { id: "b", externalEventId: 201, kickoffAt: "2026-08-24T16:00:00Z", result: { homeScore: 1, awayScore: 0 }, manualResult: true, resultSource: "manual" }
    ]
  };
  mergeLeagueSchedule(league, [
    sportsEvent(200, { status: "FT", homeScore: 2, awayScore: 1 }),
    sportsEvent(201, { status: "FT", homeScore: 0, awayScore: 3 })
  ], now);

  assert.deepEqual(league.matches[0].result, { homeScore: 2, awayScore: 1 });
  assert.equal(league.matches[0].resultSource, "TheSportsDB");
  assert.deepEqual(league.matches[1].result, { homeScore: 1, awayScore: 0 });
});

test("does not auto-settle extra-time, penalty, or incomplete scores", () => {
  assert.equal(eventResult(sportsEvent(210, { status: "AET", homeScore: 2, awayScore: 1 })), null);
  assert.equal(eventResult(sportsEvent(211, { status: "FT", homeScore: 2, awayScore: 1, homeExtra: 1, awayExtra: 0 })), null);
  assert.equal(eventResult(sportsEvent(212, { status: "FT", homeScore: 2 })), null);
  assert.equal(roundIsComplete([sportsEvent(213, { status: "PST", postponed: "yes" })]), true);
});

test("locked match details survive refresh while status and result still update", () => {
  const league = {
    matches: [{
      id: "locked",
      externalEventId: 220,
      externalDetailsLocked: true,
      competition: "Ръчно име",
      homeTeam: "Ръчен домакин",
      awayTeam: "Ръчен гост",
      kickoffAt: "2026-08-25T17:00:00Z",
      result: null
    }]
  };
  mergeLeagueSchedule(league, [sportsEvent(220, { status: "FT", timestamp: "2026-08-26T20:00:00", home: "API Home", away: "API Away", homeScore: 3, awayScore: 2 })], now);

  assert.equal(league.matches[0].competition, "Ръчно име");
  assert.equal(league.matches[0].homeTeam, "Ръчен домакин");
  assert.equal(league.matches[0].kickoffAt, "2026-08-25T17:00:00Z");
  assert.equal(league.matches[0].externalStatus, "FT");
  assert.deepEqual(league.matches[0].result, { homeScore: 3, awayScore: 2 });
});

test("daily sync requests current and next rounds, updates results, and advances completed rounds", async () => {
  const content = {
    predictionLeague: {
      leagues: [{
        id: "england",
        theSportsDb: { enabled: true, leagueId: 4328, season: "2026-2027", currentRound: 3, daysAhead: 14 },
        matches: [{ id: "due", externalEventId: 300, externalRound: 3, kickoffAt: "2026-08-24T16:00:00Z", result: null, externalSyncedAt: "2026-08-24T17:00:00Z" }]
      }]
    }
  };
  assert.equal(dueResultMatches(content.predictionLeague, now).length, 1);
  const calls = [];
  const result = await synchronizeFootballContent(content, {
    now,
    request: async (endpoint, parameters) => {
      calls.push({ endpoint, parameters });
      return { events: parameters.r === 3
        ? [sportsEvent(300, { round: 3, status: "FT", homeScore: 3, awayScore: 2, timestamp: "2026-08-24T16:00:00" })]
        : [sportsEvent(301, { round: 4, timestamp: "2026-08-30T16:00:00" })] };
    }
  });

  assert.deepEqual(calls.map((call) => call.parameters.r), [3, 4]);
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.settled, 1);
  assert.equal(result.summary.advanced, 1);
  assert.equal(result.content.predictionLeague.leagues[0].theSportsDb.currentRound, 4);
  assert.deepEqual(result.content.predictionLeague.leagues[0].matches.find((match) => match.id === "due").result, { homeScore: 3, awayScore: 2 });
  assert.equal(roundIsComplete([sportsEvent(1, { status: "FT", homeScore: 1, awayScore: 0 })]), true);
});

test("manual synchronization requests exactly the selected round", async () => {
  const content = { predictionLeague: { leagues: [{ id: "bg", theSportsDb: { enabled: true, leagueId: 4626, season: "2025-2026", currentRound: 30 }, matches: [] }] } };
  const calls = [];
  await synchronizeFootballContent(content, {
    now,
    leagueId: "bg",
    round: 30,
    forceSchedule: true,
    request: async (endpoint, parameters) => { calls.push({ endpoint, parameters }); return { events: [] }; }
  });
  assert.deepEqual(calls, [{ endpoint: "eventsround.php", parameters: { id: 4626, r: 30, s: "2025-2026" } }]);
});

test("manual synchronization advances when the selected current round is complete", async () => {
  const content = { predictionLeague: { leagues: [{ id: "bg", theSportsDb: { enabled: true, leagueId: 4626, season: "2026-2027", currentRound: 1 }, matches: [] }] } };
  const result = await synchronizeFootballContent(content, {
    now,
    leagueId: "bg",
    round: 1,
    forceSchedule: true,
    request: async () => ({ events: [sportsEvent(801, { round: 1, status: "FT", homeScore: 1, awayScore: 0 })] })
  });

  assert.equal(result.summary.advanced, 1);
  assert.equal(result.content.predictionLeague.leagues[0].theSportsDb.currentRound, 2);
});

test("manual synchronization works with background automation disabled", async () => {
  const content = { predictionLeague: { leagues: [{
    id: "bg",
    theSportsDb: { enabled: false, leagueId: 4626, season: "2026-2027", currentRound: 2 },
    matches: [{ id: "settled", result: { homeScore: 1, awayScore: 0 }, settledAt: "2026-08-20T10:00:00Z" }]
  }] } };
  let calls = 0;
  const manual = await synchronizeFootballContent(content, {
    now,
    leagueId: "bg",
    round: 2,
    forceSchedule: true,
    request: async () => { calls += 1; return { events: [sportsEvent(802, { round: 2 })] }; }
  });
  await synchronizeFootballContent(content, {
    now,
    request: async () => { calls += 1; return { events: [] }; }
  });

  assert.equal(calls, 1);
  assert.equal(manual.summary.added, 1);
  assert.equal(manual.summary.archived, 0);
  assert.equal(manual.content.predictionLeague.leagues[0].matches.some((match) => match.id === "settled"), true);
});

test("archives settled matches after one day but keeps recent and unfinished matches active", () => {
  const content = {
    predictionLeague: {
      leagues: [{
        id: "bg",
        theSportsDb: { enabled: true, leagueId: 4626, season: "2026-2027", currentRound: 2 },
        matches: [
          { id: "old", result: { homeScore: 2, awayScore: 1 }, settledAt: "2026-08-23T19:59:59Z" },
          { id: "recent", result: { homeScore: 1, awayScore: 1 }, settledAt: "2026-08-24T08:00:00Z" },
          { id: "open", result: null, kickoffAt: "2026-08-23T16:00:00Z" }
        ]
      }]
    }
  };

  assert.equal(archiveExpiredSettledMatches(content, now), 1);
  assert.deepEqual(content.predictionLeague.leagues[0].matches.map((match) => match.id), ["recent", "open"]);
});

test("an archived TheSportsDB event is not added again by a later round refresh", async () => {
  const content = {
    predictionLeague: {
      leagues: [{ id: "bg", theSportsDb: { enabled: true, leagueId: 4626, season: "2026-2027", currentRound: 2 }, matches: [] }]
    }
  };
  const result = await synchronizeFootballContent(content, {
    now,
    leagueId: "bg",
    round: 2,
    forceSchedule: true,
    archivedEventKeys: new Set(["bg:900"]),
    request: async () => ({ events: [sportsEvent(900, { round: 2, status: "FT", homeScore: 1, awayScore: 0 })] })
  });

  assert.equal(result.summary.added, 0);
  assert.deepEqual(result.content.predictionLeague.leagues[0].matches, []);
});
