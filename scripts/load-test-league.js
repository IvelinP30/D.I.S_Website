const { performance } = require("perf_hooks");
const {
  buildLeagueScoreRows,
  buildLeagueStateFromAggregates,
  levelProgress
} = require("../server/prediction-league");

const playerCount = Math.max(1, Number(process.env.LEAGUE_TEST_PLAYERS || 100));
const leagueCount = Math.max(1, Number(process.env.LEAGUE_TEST_LEAGUES || 5));
const matchesPerLeague = Math.max(1, Number(process.env.LEAGUE_TEST_MATCHES || 1000));
const settledPerLeague = Math.max(0, Math.min(matchesPerLeague, Number(process.env.LEAGUE_TEST_SETTLED || matchesPerLeague)));
const baseTime = Date.UTC(2025, 0, 1);
const players = Array.from({ length: playerCount }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  nickname: `PLAYER${String(index).padStart(3, "0")}`
}));

let predictionCount = 0;
let scoreCount = 0;
let scoringMilliseconds = 0;
let approximatePredictionBytes = 0;
let approximateScoreBytes = 0;

for (let leagueIndex = 0; leagueIndex < leagueCount; leagueIndex += 1) {
  const leagueId = `league-${leagueIndex + 1}`;
  const matches = Array.from({ length: matchesPerLeague }, (_, matchIndex) => ({
    id: `match-${leagueIndex + 1}-${matchIndex + 1}`,
    leagueId,
    homeTeam: `Home ${matchIndex + 1}`,
    awayTeam: `Away ${matchIndex + 1}`,
    kickoffAt: new Date(baseTime + matchIndex * 3_600_000).toISOString(),
    isDerby: matchIndex % 25 === 0,
    result: matchIndex < settledPerLeague
      ? { homeScore: matchIndex % 5, awayScore: (matchIndex * 3) % 4 }
      : null
  }));
  const predictions = [];
  for (const [playerIndex, player] of players.entries()) {
    for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
      predictions.push({
        playerId: player.id,
        leagueId,
        matchId: matches[matchIndex].id,
        homeScore: (playerIndex + matchIndex) % 5,
        awayScore: (playerIndex + matchIndex * 2) % 4
      });
    }
  }
  const started = performance.now();
  const scores = buildLeagueScoreRows(
    { id: leagueId, matches },
    { players, predictions, archivedMatches: [] }
  );
  scoringMilliseconds += performance.now() - started;
  predictionCount += predictions.length;
  scoreCount += scores.length;
  approximatePredictionBytes += Buffer.byteLength(JSON.stringify(predictions));
  approximateScoreBytes += Buffer.byteLength(JSON.stringify(scores));
}

const sampleAggregates = players.map((player) => ({
  playerId: player.id,
  nickname: player.nickname,
  totalPredictions: matchesPerLeague,
  weekPredictions: 0,
  monthPredictions: matchesPerLeague,
  totalPoints: settledPerLeague * 3,
  weekPoints: 0,
  monthPoints: settledPerLeague * 3,
  totalExactScores: 0,
  weekExactScores: 0,
  monthExactScores: 0,
  totalCorrectOutcomes: settledPerLeague,
  weekCorrectOutcomes: 0,
  monthCorrectOutcomes: settledPerLeague,
  derbyCorrect: 0,
  currentStreak: settledPerLeague,
  maxStreak: settledPerLeague,
  completedPredictions: settledPerLeague,
  globalCompletedPredictions: settledPerLeague * leagueCount,
  level: levelProgress(settledPerLeague * leagueCount)
}));
const projectionStarted = performance.now();
buildLeagueStateFromAggregates({ id: "league-1", matches: [] }, sampleAggregates);
const projectionMilliseconds = performance.now() - projectionStarted;

console.log(JSON.stringify({
  players: playerCount,
  leagues: leagueCount,
  matchesPerLeague,
  predictions: predictionCount,
  scoreEvents: scoreCount,
  scoringMilliseconds: Math.round(scoringMilliseconds),
  publicProjectionMilliseconds: Math.round(projectionMilliseconds * 100) / 100,
  compactJsonMiB: Math.round((approximatePredictionBytes + approximateScoreBytes) / 1024 / 1024 * 100) / 100,
  note: "PostgreSQL table and index size must be measured after staging import; compact JSON is only a conservative payload comparison."
}, null, 2));
