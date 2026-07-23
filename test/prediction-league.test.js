const assert = require("node:assert/strict");
const test = require("node:test");
const {
  archiveDeletedLeagueMatches,
  buildLeagueState,
  buildLeagueStateFromAggregates,
  buildLeagueScoreRows,
  buildPredictionLeagueState,
  hashRecoveryCode,
  isHostPlayer,
  levelProgress,
  levelRequirement,
  matchStatus,
  nicknameIsTaken,
  nicknameKey,
  normalizeLeagueConfig,
  normalizeLeagueCollection,
  normalizeNickname,
  normalizePrediction,
  normalizeTrophyDefinitions,
  rotatePlayerRecoveryCode,
  specialPlayerStyle
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

test("rotating a recovery code invalidates the old code without changing participation", () => {
  const store = sampleStore();
  const secret = "secret";
  const oldCode = "DIS-OLDC-2345";
  const newCode = "DIS-NEWC-6789";
  store.players[0].recoveryHash = hashRecoveryCode(oldCode, secret);
  const predictionsBefore = structuredClone(store.predictions);

  const result = rotatePlayerRecoveryCode(store, "p1", secret, () => newCode);

  assert.equal(result.recoveryCode, newCode);
  assert.equal(store.players[0].recoveryHash, hashRecoveryCode(newCode, secret));
  assert.notEqual(store.players[0].recoveryHash, hashRecoveryCode(oldCode, secret));
  assert.deepEqual(store.predictions, predictionsBefore);
  assert.equal(store.players[0].nickname, "IVAN1892");
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

test("migrates the existing single league to the general league without losing legacy predictions", () => {
  const collection = normalizeLeagueCollection(sampleConfig());
  assert.equal(collection.leagues.length, 1);
  assert.equal(collection.leagues[0].id, "general");

  const state = buildPredictionLeagueState(sampleConfig(), sampleStore(), "p1", "", now);
  assert.equal(state.selectedLeagueId, "general");
  assert.equal(state.me.nickname, "IVAN1892");
  assert.equal(state.me.totalPoints, 13);
  assert.equal(state.leagues[0].participating, true);
});

test("keeps points, trophies, matches, and leaderboards separate while sharing one profile", () => {
  const collection = {
    enabled: true,
    title: "D.I.S Лиги",
    leagues: [
      { ...sampleConfig(), id: "efbet", title: "efbet Лига" },
      {
        id: "premier-league",
        enabled: true,
        title: "Висша лига",
        seasonLabel: "2026/27",
        matches: [{ id: "e1", homeTeam: "Arsenal", awayTeam: "Liverpool", kickoffAt: "2026-07-15T18:00:00.000Z", result: { homeScore: 1, awayScore: 0 } }]
      }
    ]
  };
  const store = sampleStore();
  store.predictions = [
    { playerId: "p1", leagueId: "efbet", matchId: "m1", homeScore: 2, awayScore: 1 },
    { playerId: "p1", leagueId: "premier-league", matchId: "e1", homeScore: 0, awayScore: 1 },
    { playerId: "p2", leagueId: "premier-league", matchId: "e1", homeScore: 1, awayScore: 0 }
  ];

  const efbet = buildPredictionLeagueState(collection, store, "p1", "efbet", now);
  const england = buildPredictionLeagueState(collection, store, "p1", "premier-league", now);

  assert.equal(efbet.me.nickname, england.me.nickname);
  assert.equal(efbet.me.totalPoints, 10);
  assert.equal(england.me.totalPoints, 0);
  assert.deepEqual(efbet.matches.map((match) => match.id), ["m1", "m2", "m3"]);
  assert.deepEqual(england.matches.map((match) => match.id), ["e1"]);
  assert.deepEqual(efbet.leaderboards.season.map((row) => row.nickname), ["IVAN1892"]);
  assert.deepEqual(england.leaderboards.season.map((row) => row.nickname), ["DANI", "IVAN1892"]);
  assert.equal(england.me.badges.some((badge) => badge.id === "exact"), false);
  assert.equal(efbet.me.level.value, 2);
  assert.equal(england.me.level.value, 2);
  assert.equal(england.me.globalCompletedPredictions, 2);
  assert.equal(england.me.completedPredictions, 1);
});

test("keeps legacy untagged predictions and archived matches only in the general league", () => {
  const collection = {
    leagues: [
      { id: "general", title: "Начална лига", matches: [] },
      { id: "england", title: "Висша лига", matches: [] }
    ]
  };
  const store = {
    players: [{ id: "p1", nickname: "IVAN1892" }],
    predictions: [{ playerId: "p1", matchId: "legacy", homeScore: 2, awayScore: 0 }],
    archivedMatches: [{ id: "legacy", homeTeam: "A", awayTeam: "B", kickoffAt: "2026-07-14T18:00:00.000Z", result: { homeScore: 2, awayScore: 0 } }]
  };

  assert.equal(buildPredictionLeagueState(collection, store, "p1", "general", now).me.totalPoints, 10);
  assert.equal(buildPredictionLeagueState(collection, store, "p1", "england", now).me.totalPoints, 0);
});

test("archiving a removed league match preserves only its earned points and leaves other leagues intact", () => {
  const previous = {
    leagues: [
      { id: "efbet", matches: [{ id: "b1", homeTeam: "A", awayTeam: "B", kickoffAt: "2026-07-14T18:00:00.000Z", result: { homeScore: 2, awayScore: 0 } }] },
      { id: "england", matches: [{ id: "e1", homeTeam: "C", awayTeam: "D", kickoffAt: "2026-07-14T18:00:00.000Z", result: { homeScore: 1, awayScore: 1 } }] }
    ]
  };
  const next = { leagues: [previous.leagues[1]] };
  const store = {
    players: [{ id: "p1", nickname: "IVAN1892" }],
    predictions: [
      { playerId: "p1", leagueId: "efbet", matchId: "b1", homeScore: 2, awayScore: 0 },
      { playerId: "p1", leagueId: "england", matchId: "e1", homeScore: 1, awayScore: 1 }
    ]
  };
  const archived = archiveDeletedLeagueMatches(previous, next, store);

  assert.equal(archived.archivedMatches.find((match) => match.id === "b1")?.leagueId, "efbet");
  assert.equal(archived.predictions.length, 2);
  assert.equal(buildPredictionLeagueState(next, archived, "p1", "england", now).me.totalPoints, 10);
});

test("locks matches at kickoff and keeps future matches open", () => {
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T11:00:00.000Z" }, now), "locked");
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T13:00:00.000Z" }, now), "open");
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T13:00:00.000Z", result: { homeScore: 1, awayScore: 0 } }, now), "settled");
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T13:00:00.000Z", apiStatus: "PST" }, now), "postponed");
  assert.equal(matchStatus({ kickoffAt: "2026-07-17T13:00:00.000Z", apiStatus: "CANC" }, now), "cancelled");
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
  assert.equal(state.matches.some((match) => "participantCount" in match), false);
  assert.equal(state.leaderboards.week.find((row) => row.nickname === "DANI").points, 3);
  assert.equal(state.leaderboards.week.some((row) => "playerId" in row), false);
  assert.doesNotMatch(JSON.stringify(state), /"p1"|"p2"|recoveryHash/);

  const anonymousState = buildLeagueState(sampleConfig(), sampleStore(), "", now);
  assert.equal(anonymousState.matches.every((match) => match.myPrediction === null), true);
});

test("levels start quickly, count only settled participation, and get progressively harder", () => {
  assert.deepEqual([0, 1, 2, 3, 6, 10].map((matches) => levelProgress(matches).value), [1, 2, 2, 3, 4, 5]);
  assert.deepEqual([0, 1, 3, 6, 45].map((matches) => levelProgress(matches).name), ["Дебютант", "Млад талант", "Голова надежда", "Титуляр", "Плеймейкър"]);
  assert.equal(levelProgress(2).matchesToNext, 1);
  assert.equal(levelProgress(10).matchesToNext, 5);
  assert.equal(levelProgress(45).tier, "silver");
  assert.deepEqual([10, 20, 30, 40, 50].map(levelRequirement), [45, 125, 245, 405, 605]);
  assert.equal(levelProgress(125).value, 20);
  assert.equal(levelProgress(245).tier, "platinum");
  assert.equal(levelProgress(405).tier, "diamond");
  assert.equal(levelProgress(604).matchesToNext, 1);
  assert.equal(levelProgress(605).tier, "legendary");
});

test("keeps unique ranks and rewards equal league results achieved in fewer completed matches", () => {
  const config = {
    enabled: true,
    matches: [
      { id: "m1", homeTeam: "A", awayTeam: "B", kickoffAt: "2026-07-14T18:00:00.000Z", result: { homeScore: 2, awayScore: 1 } },
      { id: "m2", homeTeam: "C", awayTeam: "D", kickoffAt: "2026-07-15T18:00:00.000Z", result: { homeScore: 1, awayScore: 0 } },
      { id: "m3", homeTeam: "E", awayTeam: "F", kickoffAt: "2026-07-20T18:00:00.000Z" }
    ]
  };
  const players = [
    { id: "p1", nickname: "ZULU" },
    { id: "p2", nickname: "ALPHA" }
  ];
  const predictions = [
    { playerId: "p1", matchId: "m1", homeScore: 2, awayScore: 1 },
    { playerId: "p1", matchId: "m2", homeScore: 0, awayScore: 2 },
    { playerId: "p2", matchId: "m1", homeScore: 2, awayScore: 1 },
    { playerId: "p2", matchId: "m3", homeScore: 1, awayScore: 0 }
  ];

  const state = buildLeagueState(config, { players, predictions }, "p1", now);

  assert.deepEqual(state.leaderboards.season.map((row) => [row.nickname, row.rank]), [["ALPHA", 1], ["ZULU", 2]]);
  assert.equal(state.leaderboards.season[0].leagueCompletedPredictions, 1);
  assert.equal(state.leaderboards.season[1].leagueCompletedPredictions, 2);
  assert.deepEqual(state.leaderboards.season[0].ranks, { week: 1, month: 1, season: 1 });
  assert.ok(state.leaderboards.month[0].badges.some((badge) => badge.id === "oracle"));
  assert.equal(state.leaderboards.month[1].badges.some((badge) => badge.id === "oracle"), false);
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
  assert.equal(state.me.correctOutcomes, 2);
  assert.equal(state.me.completedPredictions, 2);
  assert.equal(state.me.globalCompletedPredictions, 2);
  assert.equal(state.me.level.value, 2);
  assert.equal(state.me.ranks.week, 1);
});

test("marks only the configured host player ids without exposing those ids publicly", () => {
  const hostId = "19506ff2-a454-4be0-acb8-e511047babad";
  const store = sampleStore();
  store.players[0].id = hostId;
  store.predictions.forEach((prediction) => {
    if (prediction.playerId === "p1") prediction.playerId = hostId;
  });

  const state = buildLeagueState(sampleConfig(), store, hostId, now);

  assert.equal(isHostPlayer(store.players[0]), true);
  assert.equal(isHostPlayer({ id: "42fc9e3c-8e3f-4612-93b2-5cb774b98653" }), true);
  assert.equal(state.me.isHost, true);
  assert.equal(state.leaderboards.season.find((row) => row.nickname === "IVAN1892").isHost, true);
  assert.equal(state.leaderboards.season.find((row) => row.nickname === "DANI").isHost, false);
  assert.doesNotMatch(JSON.stringify(state), new RegExp(hostId));
  assert.doesNotMatch(JSON.stringify(state), /recoveryHash/);
});

test("keeps the developer and queen roles in production without exposing ids", () => {
  const developerId = "ad9af2c0-6712-46db-89ed-4b2f17047523";
  const queenId = "cc90357d-52a1-4a94-8669-365de3aa821f";
  assert.equal(specialPlayerStyle({ id: developerId }), "developer");
  assert.equal(specialPlayerStyle({ id: queenId }), "pink");
  assert.equal(specialPlayerStyle({ id: "e335d091-2c81-4b28-beed-2b5cc4d9b533" }), "");

  const state = buildLeagueState(sampleConfig(), {
    players: [
      { id: developerId, nickname: "DEV" },
      { id: queenId, nickname: "QUEEN" }
    ],
    predictions: [
      { playerId: developerId, matchId: "m1", homeScore: 2, awayScore: 1, submittedAt: "2026-07-13T10:00:00.000Z" },
      { playerId: queenId, matchId: "m1", homeScore: 1, awayScore: 0, submittedAt: "2026-07-13T11:00:00.000Z" }
    ]
  }, queenId, now);

  assert.equal(state.me.specialStyle, "pink");
  assert.equal(state.leaderboards.season.find((row) => row.nickname === "DEV").specialStyle, "developer");
  assert.doesNotMatch(JSON.stringify(state), new RegExp(`${developerId}|${queenId}`));
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

test("relational aggregate state preserves legacy points, ranks, levels, trophies, and private picks", () => {
  const config = sampleConfig();
  const store = sampleStore();
  const scoreRows = buildLeagueScoreRows(config, store);
  const aggregates = store.players.map((player) => {
    const state = buildLeagueState(config, store, player.id, now);
    const season = state.leaderboards.season.find((row) => row.nickname === player.nickname);
    const week = state.leaderboards.week.find((row) => row.nickname === player.nickname);
    const month = state.leaderboards.month.find((row) => row.nickname === player.nickname);
    return {
      playerId: player.id,
      nickname: player.nickname,
      totalPredictions: state.me.totalPredictions,
      weekPredictions: week?.predictions || 0,
      monthPredictions: month?.predictions || 0,
      totalPoints: state.me.totalPoints,
      weekPoints: state.me.weeklyPoints,
      monthPoints: state.me.monthlyPoints,
      totalExactScores: state.me.exactScores,
      weekExactScores: week?.exactScores || 0,
      monthExactScores: month?.exactScores || 0,
      totalCorrectOutcomes: state.me.correctOutcomes,
      weekCorrectOutcomes: week?.correctOutcomes || 0,
      monthCorrectOutcomes: month?.correctOutcomes || 0,
      derbyCorrect: scoreRows.filter((row) => row.playerId === player.id && row.derbyCorrect).length,
      currentStreak: state.me.currentStreak,
      maxStreak: state.me.maxStreak,
      completedPredictions: state.me.completedPredictions,
      globalCompletedPredictions: state.me.globalCompletedPredictions,
      seasonPredictions: season?.predictions || 0
    };
  });
  const relational = buildLeagueStateFromAggregates(
    config,
    aggregates,
    "p1",
    store.predictions.filter((prediction) => prediction.playerId === "p1"),
    scoreRows.filter((row) => row.playerId === "p1"),
    now
  );
  const legacy = buildLeagueState(config, store, "p1", now);

  assert.deepEqual(relational.me, legacy.me);
  assert.deepEqual(relational.leaderboards, legacy.leaderboards);
  assert.deepEqual(relational.matches, legacy.matches);
  assert.doesNotMatch(JSON.stringify(relational), /"p1"|"p2"|recoveryHash/);
});

test("relational score rows preserve settled archived scoring without retaining it in the public match list", () => {
  const previousConfig = sampleConfig();
  const nextConfig = { ...previousConfig, matches: previousConfig.matches.filter((match) => match.id === "m3") };
  const archivedStore = archiveDeletedLeagueMatches(previousConfig, nextConfig, sampleStore());
  const rows = buildLeagueScoreRows(nextConfig, archivedStore);

  assert.equal(rows.filter((row) => row.playerId === "p1").reduce((sum, row) => sum + row.points, 0), 13);
  assert.deepEqual(rows.filter((row) => row.playerId === "p1").map((row) => row.matchId), ["m1", "m2"]);
});
