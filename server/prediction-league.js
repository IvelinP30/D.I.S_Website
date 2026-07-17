const crypto = require("crypto");

const POINTS = Object.freeze({ outcome: 3, exactScore: 7, streakEvery: 3, streakBonus: 2 });
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TROPHY_TIERS = Object.freeze({
  bronze: "Бронзово",
  silver: "Сребърно",
  gold: "Златно",
  platinum: "Платинено",
  legendary: "Легендарно"
});

const TROPHY_CONDITIONS = Object.freeze({
  exact: "Познал си точния резултат в поне един мач.",
  voice: "Участвал си с прогноза в поне 10 мача.",
  derby: "Познал си победителя или равенството в 3 дербита.",
  streak: "Направил си 5 правилни прогнози поред.",
  monthlyChampion: "Завършил си на първо място в месечната класация."
});

const DEFAULT_TROPHY_DEFINITIONS = Object.freeze([
  { id: "exact", condition: "exact", label: "Точен мерник", tier: "bronze" },
  { id: "voice", condition: "voice", label: "Гласът на трибуните", tier: "silver" },
  { id: "derby", condition: "derby", label: "Дерби експерт", tier: "gold" },
  { id: "streak", condition: "streak", label: "Без загуба", tier: "platinum" },
  { id: "oracle", condition: "monthlyChampion", label: "Шампион на месеца", tier: "legendary" }
]);

function normalizeTrophyDefinitions(value) {
  const source = value === undefined ? DEFAULT_TROPHY_DEFINITIONS : (Array.isArray(value) ? value : []);
  const usedIds = new Set();
  return source.slice(0, 20).map((item, index) => {
    const condition = Object.hasOwn(TROPHY_CONDITIONS, item?.condition) ? item.condition : "exact";
    const tier = Object.hasOwn(TROPHY_TIERS, item?.tier) ? item.tier : "bronze";
    const requestedId = String(item?.id || `trophy-${index + 1}`).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || `trophy-${index + 1}`;
    let id = requestedId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${requestedId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return {
      id,
      condition,
      label: String(item?.label || `Трофей ${index + 1}`).trim().slice(0, 48) || `Трофей ${index + 1}`,
      description: TROPHY_CONDITIONS[condition],
      tier,
      tierLabel: TROPHY_TIERS[tier]
    };
  });
}

const BADGE_DEFINITIONS = Object.freeze(Object.fromEntries(
  normalizeTrophyDefinitions(DEFAULT_TROPHY_DEFINITIONS).map((trophy) => [trophy.id, trophy])
));

function normalizeNickname(value) {
  const nickname = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 24);
  if (nickname.length < 3) throw new Error("Прякорът трябва да е поне 3 символа.");
  if (!/^[\p{L}\p{N}_. -]+$/u.test(nickname)) {
    throw new Error("Използвай само букви, цифри, интервал, точка, тире или долна черта.");
  }
  if (/\p{Script=Latin}/u.test(nickname) && /\p{Script=Cyrillic}/u.test(nickname)) {
    throw new Error("Не смесвай латиница и кирилица в един прякор.");
  }
  return nickname;
}

function nicknameKey(value) {
  return normalizeNickname(value).toLocaleLowerCase("bg-BG").replace(/[._\s-]+/gu, "");
}

function nicknameIsTaken(players, value, excludedPlayerId = "") {
  const key = nicknameKey(value);
  return (Array.isArray(players) ? players : []).some((player) => {
    if (player.id === excludedPlayerId) return false;
    const storedKey = String(player.nicknameKey || "").normalize("NFKC").toLocaleLowerCase("bg-BG").replace(/[._\s-]+/gu, "");
    let currentKey = storedKey;
    try {
      currentKey = nicknameKey(player.nickname);
    } catch {
      // Keep older valid participants usable even if their nickname predates stricter rules.
    }
    return currentKey === key || storedKey === key;
  });
}

function createRecoveryCode(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(8);
  let value = "";
  for (let index = 0; index < 8; index += 1) value += RECOVERY_ALPHABET[bytes[index] % RECOVERY_ALPHABET.length];
  return `DIS-${value.slice(0, 4)}-${value.slice(4)}`;
}

function normalizeRecoveryCode(value) {
  const compact = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^DIS/, "");
  if (compact.length !== 8) throw new Error("Recovery кодът не е валиден.");
  return `DIS-${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function hashRecoveryCode(code, secret) {
  return crypto.createHmac("sha256", secret).update(normalizeRecoveryCode(code)).digest("hex");
}

function normalizeLeagueStore(value = {}) {
  return {
    players: Array.isArray(value.players) ? value.players : [],
    predictions: Array.isArray(value.predictions) ? value.predictions : [],
    archivedMatches: Array.isArray(value.archivedMatches) ? value.archivedMatches : []
  };
}

function scoreValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 30 ? score : null;
}

function normalizePrediction(payload = {}) {
  const homeScore = scoreValue(payload.homeScore);
  const awayScore = scoreValue(payload.awayScore);
  if (homeScore === null || awayScore === null) throw new Error("Въведи валиден резултат между 0 и 30.");
  return { homeScore, awayScore };
}

function resultForMatch(match = {}) {
  const homeScore = scoreValue(match.result?.homeScore);
  const awayScore = scoreValue(match.result?.awayScore);
  return homeScore === null || awayScore === null ? null : { homeScore, awayScore };
}

function matchStatus(match = {}, now = Date.now()) {
  if (resultForMatch(match)) return "settled";
  const kickoff = match.kickoffAt ? new Date(match.kickoffAt).getTime() : NaN;
  return Number.isFinite(kickoff) && kickoff <= Number(now) ? "locked" : "open";
}

function outcome(homeScore, awayScore) {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

function matchTimestamp(match = {}) {
  const timestamp = match.kickoffAt ? new Date(match.kickoffAt).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function startOfUtcWeek(now) {
  const date = new Date(now);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function periodRanges(now = Date.now()) {
  const date = new Date(now);
  const weekStart = startOfUtcWeek(now);
  const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return {
    week: [weekStart, weekStart + 7 * 86400000],
    month: [monthStart, Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)],
    season: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
  };
}

function periodLabels(now = Date.now()) {
  const ranges = periodRanges(now);
  const formatDay = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "short", timeZone: "UTC" });
  const formatMonth = new Intl.DateTimeFormat("bg-BG", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    week: `${formatDay.format(ranges.week[0])} – ${formatDay.format(ranges.week[1] - 1)}`,
    month: formatMonth.format(ranges.month[0])
  };
}

function normalizeLeagueConfig(value = {}) {
  return {
    enabled: value.enabled !== false,
    title: String(value.title || "D.I.S Лига на прогнозите").trim(),
    description: String(value.description || "Прогнозирай резултата, печели точки и се изкачи в седмичната класация.").trim(),
    seasonLabel: String(value.seasonLabel || "D.I.S Сезон 2026/27").trim(),
    trophies: normalizeTrophyDefinitions(value.trophies),
    matches: (Array.isArray(value.matches) ? value.matches : [])
      .filter((match) => match && match.enabled !== false && String(match.id || "").trim())
      .map((match) => ({
        id: String(match.id),
        competition: String(match.competition || "D.I.S Matchday").trim(),
        homeTeam: String(match.homeTeam || "Отбор A").trim(),
        awayTeam: String(match.awayTeam || "Отбор B").trim(),
        kickoffAt: String(match.kickoffAt || ""),
        isDerby: Boolean(match.isDerby),
        result: resultForMatch(match),
        settledAt: String(match.settledAt || "")
      }))
  };
}

function normalizeAllLeagueMatches(value = {}) {
  const matches = (Array.isArray(value.matches) ? value.matches : []).map((match) => ({ ...match, enabled: true }));
  return normalizeLeagueConfig({ ...value, matches }).matches;
}

function archiveDeletedLeagueMatches(rawPreviousConfig, rawNextConfig, rawStore) {
  const store = normalizeLeagueStore(rawStore);
  const previousMatches = normalizeAllLeagueMatches(rawPreviousConfig);
  const nextMatches = normalizeAllLeagueMatches(rawNextConfig);
  const nextIds = new Set(nextMatches.map((match) => match.id));
  const archivedById = new Map(
    normalizeAllLeagueMatches({ matches: store.archivedMatches })
      .filter((match) => !nextIds.has(match.id) && resultForMatch(match))
      .map((match) => [match.id, match])
  );

  previousMatches.forEach((match) => {
    if (!nextIds.has(match.id) && resultForMatch(match)) archivedById.set(match.id, match);
  });

  const archivedMatches = [...archivedById.values()];
  const preservedMatchIds = new Set([...nextIds, ...archivedMatches.map((match) => match.id)]);
  return {
    players: store.players,
    predictions: store.predictions.filter((prediction) => preservedMatchIds.has(prediction.matchId)),
    archivedMatches
  };
}

function scoreEvents(config, store) {
  const matches = new Map(config.matches.map((match) => [match.id, match]));
  const predictionsByPlayer = new Map();
  store.predictions.forEach((prediction) => {
    if (!matches.has(prediction.matchId)) return;
    if (!predictionsByPlayer.has(prediction.playerId)) predictionsByPlayer.set(prediction.playerId, []);
    predictionsByPlayer.get(prediction.playerId).push(prediction);
  });

  const events = new Map();
  const stats = new Map();
  store.players.forEach((player) => {
    const predictions = (predictionsByPlayer.get(player.id) || [])
      .filter((prediction) => resultForMatch(matches.get(prediction.matchId)))
      .sort((left, right) => matchTimestamp(matches.get(left.matchId)) - matchTimestamp(matches.get(right.matchId)));
    let streak = 0;
    let maxStreak = 0;
    let exactScores = 0;
    let correctOutcomes = 0;
    let derbyCorrect = 0;
    let points = 0;
    const playerEvents = new Map();

    predictions.forEach((prediction) => {
      const match = matches.get(prediction.matchId);
      const result = resultForMatch(match);
      const predicted = normalizePrediction(prediction);
      const correctOutcome = outcome(predicted.homeScore, predicted.awayScore) === outcome(result.homeScore, result.awayScore);
      const exactScore = predicted.homeScore === result.homeScore && predicted.awayScore === result.awayScore;
      streak = correctOutcome ? streak + 1 : 0;
      maxStreak = Math.max(maxStreak, streak);
      if (correctOutcome) correctOutcomes += 1;
      if (exactScore) exactScores += 1;
      if (correctOutcome && match.isDerby) derbyCorrect += 1;
      const outcomePoints = correctOutcome ? POINTS.outcome : 0;
      const exactScorePoints = exactScore ? POINTS.exactScore : 0;
      const streakBonus = correctOutcome && streak % POINTS.streakEvery === 0 ? POINTS.streakBonus : 0;
      const eventPoints = outcomePoints + exactScorePoints + streakBonus;
      points += eventPoints;
      playerEvents.set(match.id, {
        points: eventPoints,
        outcomePoints,
        exactScorePoints,
        streakBonus,
        correctOutcome,
        exactScore,
        streakAfter: streak
      });
    });

    const totalPredictions = (predictionsByPlayer.get(player.id) || []).length;
    const trophyStats = { exactScores, derbyCorrect, maxStreak, totalPredictions };
    const badges = config.trophies.filter((trophy) => {
      if (trophy.condition === "exact") return trophyStats.exactScores >= 1;
      if (trophy.condition === "voice") return trophyStats.totalPredictions >= 10;
      if (trophy.condition === "derby") return trophyStats.derbyCorrect >= 3;
      if (trophy.condition === "streak") return trophyStats.maxStreak >= 5;
      return false;
    });
    events.set(player.id, playerEvents);
    stats.set(player.id, { points, exactScores, correctOutcomes, derbyCorrect, currentStreak: streak, maxStreak, totalPredictions, badges });
  });
  return { events, stats };
}

function buildLeaderboard(period, config, store, scoring, now) {
  const [start, end] = periodRanges(now)[period];
  const matchIds = new Set(config.matches.filter((match) => {
    const timestamp = matchTimestamp(match);
    return period === "season" || (timestamp >= start && timestamp < end);
  }).map((match) => match.id));

  const rows = store.players.map((player) => {
    const playerPredictions = store.predictions.filter((prediction) => prediction.playerId === player.id && matchIds.has(prediction.matchId));
    const playerEvents = scoring.events.get(player.id) || new Map();
    const periodEvents = [...playerEvents.entries()].filter(([matchId]) => matchIds.has(matchId)).map(([, event]) => event);
    return {
      playerId: player.id,
      nickname: player.nickname,
      points: periodEvents.reduce((sum, event) => sum + event.points, 0),
      exactScores: periodEvents.filter((event) => event.exactScore).length,
      correctOutcomes: periodEvents.filter((event) => event.correctOutcome).length,
      predictions: playerPredictions.length,
      badges: scoring.stats.get(player.id)?.badges || []
    };
  }).filter((row) => row.predictions > 0);

  rows.sort((left, right) =>
    right.points - left.points ||
    right.exactScores - left.exactScores ||
    right.correctOutcomes - left.correctOutcomes ||
    left.nickname.localeCompare(right.nickname, "bg-BG")
  );
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildLeagueState(rawConfig, rawStore, playerId = "", now = Date.now()) {
  const config = normalizeLeagueConfig(rawConfig);
  const store = normalizeLeagueStore(rawStore);
  const activeMatchIds = new Set(normalizeAllLeagueMatches(rawConfig).map((match) => match.id));
  const archivedMatches = normalizeAllLeagueMatches({ matches: store.archivedMatches }).filter((match) => !activeMatchIds.has(match.id));
  const scoringConfig = { ...config, matches: [...normalizeAllLeagueMatches(rawConfig), ...archivedMatches] };
  const scoring = scoreEvents(scoringConfig, store);
  const leaderboards = {
    week: buildLeaderboard("week", scoringConfig, store, scoring, now),
    month: buildLeaderboard("month", scoringConfig, store, scoring, now),
    season: buildLeaderboard("season", scoringConfig, store, scoring, now)
  };
  const monthlyChampionTrophies = config.trophies.filter((trophy) => trophy.condition === "monthlyChampion");
  if (leaderboards.month[0]?.points > 0 && monthlyChampionTrophies.length) {
    const championId = leaderboards.month[0].playerId;
    const stats = scoring.stats.get(championId);
    monthlyChampionTrophies.forEach((trophy) => {
      if (stats && !stats.badges.some((badge) => badge.id === trophy.id)) stats.badges.push(trophy);
      Object.values(leaderboards).forEach((rows) => {
        const row = rows.find((item) => item.playerId === championId);
        if (row && !row.badges.some((badge) => badge.id === trophy.id)) row.badges = [...row.badges, trophy];
      });
    });
  }

  const player = store.players.find((item) => item.id === playerId);
  const playerPredictions = new Map(store.predictions.filter((item) => item.playerId === playerId).map((item) => [item.matchId, item]));
  const playerEvents = scoring.events.get(playerId) || new Map();
  const publicMatches = [...config.matches]
    .sort((left, right) => matchTimestamp(left) - matchTimestamp(right))
    .map((match) => {
      const prediction = playerPredictions.get(match.id);
      const event = playerEvents.get(match.id);
      return {
        id: match.id,
        competition: match.competition,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        kickoffAt: match.kickoffAt,
        isDerby: match.isDerby,
        status: matchStatus(match, now),
        result: resultForMatch(match),
        myPrediction: prediction ? {
          homeScore: Number(prediction.homeScore),
          awayScore: Number(prediction.awayScore),
          submittedAt: prediction.submittedAt,
          updatedAt: prediction.updatedAt,
          scoring: event || null
        } : null
      };
    });

  let me = null;
  if (player) {
    const stats = scoring.stats.get(player.id) || { points: 0, exactScores: 0, correctOutcomes: 0, currentStreak: 0, maxStreak: 0, totalPredictions: 0, badges: [] };
    const rankFor = (period) => leaderboards[period].find((row) => row.playerId === player.id)?.rank || null;
    const pointsFor = (period) => leaderboards[period].find((row) => row.playerId === player.id)?.points || 0;
    me = {
      nickname: player.nickname,
      totalPoints: stats.points,
      weeklyPoints: pointsFor("week"),
      monthlyPoints: pointsFor("month"),
      ranks: { week: rankFor("week"), month: rankFor("month"), season: rankFor("season") },
      currentStreak: stats.currentStreak,
      maxStreak: stats.maxStreak,
      totalPredictions: stats.totalPredictions,
      correctOutcomes: stats.correctOutcomes,
      exactScores: stats.exactScores,
      badges: stats.badges
    };
  }

  const safeLeaderboard = (rows) => rows.slice(0, 50).map(({ playerId: _playerId, ...row }) => row);
  return {
    enabled: config.enabled,
    title: config.title,
    description: config.description,
    seasonLabel: config.seasonLabel,
    points: POINTS,
    periods: periodLabels(now),
    matches: publicMatches,
    me,
    leaderboards: {
      week: safeLeaderboard(leaderboards.week),
      month: safeLeaderboard(leaderboards.month),
      season: safeLeaderboard(leaderboards.season)
    }
  };
}

module.exports = {
  BADGE_DEFINITIONS,
  DEFAULT_TROPHY_DEFINITIONS,
  POINTS,
  TROPHY_CONDITIONS,
  TROPHY_TIERS,
  archiveDeletedLeagueMatches,
  buildLeagueState,
  createRecoveryCode,
  hashRecoveryCode,
  matchStatus,
  nicknameIsTaken,
  nicknameKey,
  normalizeLeagueConfig,
  normalizeLeagueStore,
  normalizeNickname,
  normalizePrediction,
  normalizeRecoveryCode,
  normalizeTrophyDefinitions,
  resultForMatch
};
