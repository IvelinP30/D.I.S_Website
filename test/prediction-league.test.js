const assert = require("node:assert/strict");
const test = require("node:test");
const {
  archiveDeletedLeagueMatches,
  buildLeagueState,
  hashRecoveryCode,
  matchStatus,
  nicknameIsTaken,
  nicknameKey,
  normalizeLeagueConfig,
  normalizeNickname,
  normalizePrediction,
  normalizeTrophyDefinitions
} = require("../server/prediction-league");

const now = Date.parse("2026-07-17T12:00:00.000Z");

function sampleConfig() {
  return {
    enabled: true,
    title: "D.I.S Prediction League",
    matches: [
      { id: "m1", homeTeam: "A", awayTeam: "B", kickoffAt: "2026-07-14T18:00:00.000Z", isDerby: true, result: { homeScore: 2, awayScore: 1 } },
      { id: "m2", homeTeam: "C", awayTeam: "D", kickoffAt: "2026-07-16T18:00:00.000Z", result: { homeScore: 0, awayScore: 0 } },
      { id: "m3", homeTeam: "E", awayTeam: "F", kickoffAt: "2026-07-20T18:00:00.000Z" }
    ]
  };
}

function sampleStore() {
  return {
    players: [
      { id: "p1", nickname: "IVAN1892" },
      { id: "p2", nickname: "DANI" }
    ],
    predictions: [
      { playerId: "p1", matchId: "m1", homeScore: 2, awayScore: 1, submittedAt: "2026-07-13T10:00:00.000Z" },
      { playerId: "p1", matchId: "m2", homeScore: 1, awayScore: 1, submittedAt: "2026-07-15T10:00:00.000Z" },
      { playerId: "p2", matchId: "m1", homeScore: 1, awayScore: 0, submittedAt: "2026-07-13T11:00:00.000Z" }
    ]
  };
}

test("normalizes safe nicknames and prediction scores", () => {
  assert.equal(normalizeNickname("  Иван   1892  "), "Иван 1892");
  assert.equal(nicknameKey("GUNNER_BG"), nicknameKey("gunner_bg"));
  assert.equal(nicknameKey("Gunner- BG"), nicknameKey("gunnerbg"));
  assert.equal(nicknameIsTaken([{ id: "p1", nickname: "GUNNER_BG", nicknameKey: "gunner_bg" }], "gunner bg"), true);
  assert.equal(nicknameIsTaken([{ id: "p1", nickname: "GUNNER_BG" }], "gunnerbg", "p1"), false);
  assert.throws(() => normalizeNickname("Mеska10"), /Не смесвай/);
  assert.deepEqual(normalizePrediction({ homeScore: "2", awayScore: 1 }), { homeScore: 2, awayScore: 1 });
  assert.throws(() => normalizeNickname("x"), /поне 3/);
  assert.throws(() => normalizePrediction({ homeScore: -1, awayScore: 1 }), /между 0 и 30/);
});

test("recovery hashes are deterministic but do not expose the code", () => {
  const first = hashRecoveryCode("DIS-ABCD-2345", "secret");
  const second = hashRecoveryCode("dis abcd 2345", "secret");
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.doesNotMatch(first, /ABCD/);
});

test("scores exact results as outcome plus exact-score points", () => {
  const state = buildLeagueState(sampleConfig(), sampleStore(), "p1", now);
  assert.equal(state.me.totalPoints, 13);
  assert.equal(state.me.exactScores, 1);
  assert.equal(state.me.correctOutcomes, 2);
  assert.equal(state.me.currentStreak, 2);
  assert.equal(state.me.ranks.week, 1);
  assert.equal(state.matches.find((match) => match.id === "m1").myPrediction.scoring.points, 10);
  assert.ok(state.me.badges.some((badge) => badge.id === "exact"));
  assert.equal(state.me.badges.find((badge) => badge.id === "exact")?.tier, "bronze");
  assert.equal(state.me.badges.find((badge) => badge.id === "oracle")?.label, "Шампион на месеца");
  assert.equal(state.me.badges.find((badge) => badge.id === "oracle")?.tier, "legendary");
});

test("uses editable trophy names, conditions, and fixed difficulty tiers", () => {
  const config = sampleConfig();
  config.trophies = [
    { id: "custom-exact", condition: "exact", label: "Моят мерник", tier: "legendary" },
    { id: "custom-champion", condition: "monthlyChampion", label: "Лидерът", tier: "gold" }
  ];

  const state = buildLeagueState(config, sampleStore(), "p1", now);
  assert.deepEqual(state.me.badges.map((badge) => badge.id), ["custom-exact", "custom-champion"]);
  assert.equal(state.me.badges[0].label, "Моят мерник");
  assert.equal(state.me.badges[0].tierLabel, "Легендарно");
  assert.equal(state.me.totalPoints, 13);

  config.trophies = [];
  const withoutTrophies = buildLeagueState(config, sampleStore(), "p1", now);
  assert.deepEqual(withoutTrophies.me.badges, []);
  assert.equal(withoutTrophies.me.totalPoints, 13);
});

test("normalizes trophy ids and rejects unsupported list values", () => {
  const trophies = normalizeTrophyDefinitions([
    { id: "same", condition: "unknown", label: "Първи", tier: "unknown" },
    { id: "same", condition: "voice", label: "Втори", tier: "silver" }
  ]);
  assert.deepEqual(trophies.map((trophy) => trophy.id), ["same", "same-2"]);
  assert.equal(trophies[0].condition, "exact");
  assert.equal(trophies[0].tier, "bronze");
  assert.equal(trophies[1].description, "Участвал си с прогноза в поне 10 мача.");
  assert.equal(normalizeLeagueConfig({ trophies: [] }).trophies.length, 0);
  assert.equal(normalizeLeagueConfig({}).trophies.length, 5);
});

test("locks matches at kickoff and keeps future matches open", () => {
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T11:00:00.000Z" }, now), "locked");
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T13:00:00.000Z" }, now), "open");
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T13:00:00.000Z", result: { homeScore: 1, awayScore: 0 } }, now), "settled");
});

test("adds the three-result streak bonus deterministically", () => {
  const config = sampleConfig();
  config.matches[2] = { ...config.matches[2], kickoffAt: "2026-07-17T10:00:00.000Z", result: { homeScore: 3, awayScore: 0 } };
  const store = sampleStore();
  store.predictions.push({ playerId: "p1", matchId: "m3", homeScore: 1, awayScore: 0, submittedAt: "2026-07-16T12:00:00.000Z" });
  const state = buildLeagueState(config, store, "p1", now);
  assert.equal(state.matches.find((match) => match.id === "m3").myPrediction.scoring.streakBonus, 2);
  assert.equal(state.me.totalPoints, 18);
});

test("public state exposes only the current player's picks and no internal identities", () => {
  const state = buildLeagueState(sampleConfig(), sampleStore(), "p1", now);
  assert.equal(state.matches.find((match) => match.id === "m1").myPrediction.homeScore, 2);
  assert.equal(state.leaderboards.week.find((row) => row.nickname === "DANI").points, 3);
  assert.equal(state.leaderboards.week.some((row) => "playerId" in row), false);
  assert.doesNotMatch(JSON.stringify(state), /"p1"|"p2"|recoveryHash/);

  const anonymousState = buildLeagueState(sampleConfig(), sampleStore(), "", now);
  assert.equal(anonymousState.matches.every((match) => match.myPrediction === null), true);
});

test("deleting settled matches hides them but preserves earned points", () => {
  const previousConfig = sampleConfig();
  const nextConfig = { ...previousConfig, matches: previousConfig.matches.filter((match) => match.id === "m3") };
  const archivedStore = archiveDeletedLeagueMatches(previousConfig, nextConfig, sampleStore());

  assert.deepEqual(archivedStore.archivedMatches.map((match) => match.id), ["m1", "m2"]);
  assert.equal(archivedStore.predictions.length, 3);

  const state = buildLeagueState(nextConfig, archivedStore, "p1", now);
  assert.deepEqual(state.matches.map((match) => match.id), ["m3"]);
  assert.equal(state.me.totalPoints, 13);
  assert.equal(state.me.exactScores, 1);
  assert.equal(state.me.ranks.week, 1);
});

test("archived scoring survives later admin saves", () => {
  const previousConfig = sampleConfig();
  const activeConfig = { ...previousConfig, matches: previousConfig.matches.filter((match) => match.id === "m3") };
  const firstSave = archiveDeletedLeagueMatches(previousConfig, activeConfig, sampleStore());
  const laterSave = archiveDeletedLeagueMatches(activeConfig, activeConfig, firstSave);

  assert.deepEqual(laterSave.archivedMatches.map((match) => match.id), ["m1", "m2"]);
  assert.equal(buildLeagueState(activeConfig, laterSave, "p1", now).me.totalPoints, 13);
});

test("deleting an unsettled match removes predictions that never earned points", () => {
  const previousConfig = sampleConfig();
  const nextConfig = { ...previousConfig, matches: previousConfig.matches.filter((match) => match.id !== "m3") };
  const store = sampleStore();
  store.predictions.push({ playerId: "p1", matchId: "m3", homeScore: 2, awayScore: 0, submittedAt: "2026-07-16T12:00:00.000Z" });

  const archivedStore = archiveDeletedLeagueMatches(previousConfig, nextConfig, store);
  assert.equal(archivedStore.archivedMatches.some((match) => match.id === "m3"), false);
  assert.equal(archivedStore.predictions.some((prediction) => prediction.matchId === "m3"), false);
});

test("hiding a settled match keeps its scoring without showing it publicly", () => {
  const config = sampleConfig();
  config.matches[0].enabled = false;

  const state = buildLeagueState(config, sampleStore(), "p1", now);
  assert.equal(state.matches.some((match) => match.id === "m1"), false);
  assert.equal(state.me.totalPoints, 13);
  assert.equal(state.me.exactScores, 1);
});
