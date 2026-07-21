const assert = require("node:assert/strict");
const test = require("node:test");
const {
  apiFixtureResult,
  applyFixtureResults,
  dueResultMatches,
  mergeLeagueSchedule,
  normalizeFootballSettings,
  synchronizeFootballContent,
  zonedDate
} = require("../server/football-sync");

const now = Date.parse("2026-08-22T20:00:00Z");

function apiFixture(id, options = {}) {
  return {
    fixture: {
      id,
      date: options.date || "2026-08-23T19:30:00+03:00",
      status: { short: options.status || "NS" }
    },
    league: { id: 39, name: "Premier League", round: options.round || "Regular Season - 3" },
    teams: {
      home: { id: options.homeId || 42, name: options.home || "Arsenal" },
      away: { id: options.awayId || 49, name: options.away || "Chelsea" }
    },
    goals: { home: options.homeScore ?? null, away: options.awayScore ?? null },
    score: {
      fulltime: {
        home: options.regulationHomeScore ?? options.homeScore ?? null,
        away: options.regulationAwayScore ?? options.awayScore ?? null
      },
      extratime: { home: options.extraTimeHomeScore ?? null, away: options.extraTimeAwayScore ?? null },
      penalty: { home: options.penaltyHomeScore ?? null, away: options.penaltyAwayScore ?? null }
    }
  };
}

test("normalizes league automation settings and Sofia date windows", () => {
  assert.deepEqual(normalizeFootballSettings({ enabled: true, leagueId: "39", season: "2026", daysAhead: 30 }), {
    enabled: true,
    leagueId: 39,
    season: 2026,
    daysAhead: 14,
    lastScheduleSyncAt: "",
    lastResultSyncAt: ""
  });
  assert.equal(zonedDate(Date.parse("2026-07-22T22:30:00Z")), "2026-07-23");
});

test("imports fixtures once and updates linked schedule changes without duplicates", () => {
  const league = { title: "Висша лига", matches: [] };
  const first = mergeLeagueSchedule(league, [apiFixture(100)], now);
  const second = mergeLeagueSchedule(league, [apiFixture(100, { date: "2026-08-23T20:00:00+03:00" })], now + 1_000);

  assert.deepEqual(first, { added: 1, updated: 0 });
  assert.deepEqual(second, { added: 0, updated: 1 });
  assert.equal(league.matches.length, 1);
  assert.equal(league.matches[0].apiFixtureId, 100);
  assert.equal(league.matches[0].kickoffAt, "2026-08-23T20:00:00+03:00");
  assert.equal(league.matches[0].homeTeamMedia.logo, "https://media.api-sports.io/football/teams/42.png");
});

test("attaches an existing manual match to the matching API fixture", () => {
  const league = {
    matches: [{ id: "manual-1", homeTeam: "Arsenal", awayTeam: "Chelsea", kickoffAt: "2026-08-23T16:30:00Z", result: null }]
  };
  mergeLeagueSchedule(league, [apiFixture(101, { date: "2026-08-23T19:30:00+03:00" })], now);
  assert.equal(league.matches.length, 1);
  assert.equal(league.matches[0].id, "manual-1");
  assert.equal(league.matches[0].apiFixtureId, 101);
});

test("settles finished API fixtures but never overwrites a manual result", () => {
  const predictionLeague = {
    leagues: [{
      id: "england",
      matches: [
        { id: "a", apiFixtureId: 200, kickoffAt: "2026-08-22T16:00:00Z", result: null },
        { id: "b", apiFixtureId: 201, kickoffAt: "2026-08-22T16:00:00Z", result: { homeScore: 1, awayScore: 0 } }
      ]
    }]
  };
  const summary = applyFixtureResults(predictionLeague, [
    apiFixture(200, { status: "FT", homeScore: 2, awayScore: 1 }),
    apiFixture(201, { status: "FT", homeScore: 0, awayScore: 3 })
  ], now);

  assert.equal(summary.settled, 1);
  assert.deepEqual(predictionLeague.leagues[0].matches[0].result, { homeScore: 2, awayScore: 1 });
  assert.equal(predictionLeague.leagues[0].matches[0].resultSource, "API-Football");
  assert.deepEqual(predictionLeague.leagues[0].matches[1].result, { homeScore: 1, awayScore: 0 });
});

test("always settles the score after 90 minutes, including during extra time or after penalties", () => {
  const predictionLeague = {
    leagues: [{
      id: "cup",
      matches: [
        { id: "extra-time", apiFixtureId: 210, kickoffAt: "2026-08-22T16:00:00Z", result: null },
        { id: "penalties", apiFixtureId: 211, kickoffAt: "2026-08-22T16:00:00Z", result: null }
      ]
    }]
  };
  applyFixtureResults(predictionLeague, [
    apiFixture(210, { status: "ET", homeScore: 2, awayScore: 1, regulationHomeScore: 1, regulationAwayScore: 1, extraTimeHomeScore: 2, extraTimeAwayScore: 1 }),
    apiFixture(211, { status: "PEN", homeScore: 5, awayScore: 4, regulationHomeScore: 0, regulationAwayScore: 0, penaltyHomeScore: 5, penaltyAwayScore: 4 })
  ], now);

  assert.deepEqual(predictionLeague.leagues[0].matches[0].result, { homeScore: 1, awayScore: 1 });
  assert.deepEqual(predictionLeague.leagues[0].matches[1].result, { homeScore: 0, awayScore: 0 });
  assert.equal(apiFixtureResult(apiFixture(212, { status: "ET" })), null);
});

test("locked API match details survive schedule refreshes while status and result still update", () => {
  const league = {
    matches: [{
      id: "locked",
      apiFixtureId: 220,
      apiDetailsLocked: true,
      competition: "Ръчно име",
      homeTeam: "Ръчен домакин",
      awayTeam: "Ръчен гост",
      homeTeamMedia: null,
      awayTeamMedia: null,
      kickoffAt: "2026-08-23T17:00:00Z",
      result: null
    }]
  };
  mergeLeagueSchedule(league, [apiFixture(220, {
    status: "FT",
    date: "2026-08-24T20:00:00+03:00",
    home: "API Home",
    away: "API Away",
    homeScore: 3,
    awayScore: 2
  })], now);

  assert.equal(league.matches[0].competition, "Ръчно име");
  assert.equal(league.matches[0].homeTeam, "Ръчен домакин");
  assert.equal(league.matches[0].awayTeam, "Ръчен гост");
  assert.equal(league.matches[0].kickoffAt, "2026-08-23T17:00:00Z");
  assert.equal(league.matches[0].apiStatus, "FT");
  assert.deepEqual(league.matches[0].result, { homeScore: 3, awayScore: 2 });
});

test("checks only due unfinished fixtures and batches schedule plus results", async () => {
  const content = {
    predictionLeague: {
      leagues: [{
        id: "england",
        apiFootball: { enabled: true, leagueId: 39, season: 2026, daysAhead: 7 },
        matches: [{ id: "due", apiFixtureId: 300, kickoffAt: "2026-08-22T16:00:00Z", result: null, apiSyncedAt: "2026-08-22T17:00:00Z" }]
      }]
    }
  };
  assert.equal(dueResultMatches(content.predictionLeague, now).length, 1);
  const calls = [];
  const result = await synchronizeFootballContent(content, {
    now,
    forceSchedule: true,
    request: async (endpoint, parameters) => {
      calls.push({ endpoint, parameters });
      if (parameters.ids) return { response: [apiFixture(300, { status: "FT", homeScore: 3, awayScore: 2 })] };
      return { response: [apiFixture(301)] };
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].parameters.league, 39);
  assert.equal(calls[1].parameters.ids, "300");
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.settled, 1);
  assert.deepEqual(result.content.predictionLeague.leagues[0].matches.find((match) => match.id === "due").result, { homeScore: 3, awayScore: 2 });
});
