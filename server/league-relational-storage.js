const crypto = require("crypto");
const {
  allCollectionMatches,
  buildLeagueScoreRows,
  normalizeLeagueCollection,
  normalizeLeagueId,
  normalizeLeagueStore,
  periodRanges,
  resultForMatch
} = require("./prediction-league");

const MIGRATION_KEY = "relational_v2_migration";
const CONTENT_KEY = "relational_v2_content";
const BATCH_SIZE = 500;

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function snakePlayer(player = {}) {
  return {
    id: String(player.id),
    nickname: String(player.nickname),
    nickname_key: String(player.nicknameKey),
    recovery_hash: String(player.recoveryHash),
    created_at: player.createdAt || new Date().toISOString(),
    updated_at: player.updatedAt || player.createdAt || new Date().toISOString()
  };
}

function camelPlayer(player = {}) {
  return {
    id: String(player.id),
    nickname: String(player.nickname),
    nicknameKey: String(player.nickname_key),
    recoveryHash: String(player.recovery_hash),
    createdAt: String(player.created_at || ""),
    updatedAt: String(player.updated_at || "")
  };
}

function snakePrediction(prediction = {}) {
  return {
    player_id: String(prediction.playerId),
    league_id: normalizeLeagueId(prediction.leagueId),
    match_id: String(prediction.matchId),
    home_score: Number(prediction.homeScore),
    away_score: Number(prediction.awayScore),
    submitted_at: prediction.submittedAt || new Date().toISOString(),
    updated_at: prediction.updatedAt || prediction.submittedAt || new Date().toISOString()
  };
}

function camelPrediction(prediction = {}) {
  return {
    playerId: String(prediction.player_id),
    leagueId: String(prediction.league_id),
    matchId: String(prediction.match_id),
    homeScore: Number(prediction.home_score),
    awayScore: Number(prediction.away_score),
    submittedAt: String(prediction.submitted_at || ""),
    updatedAt: String(prediction.updated_at || "")
  };
}

function matchRow(match, archived = false) {
  const result = resultForMatch(match);
  return {
    league_id: normalizeLeagueId(match.leagueId),
    match_id: String(match.id),
    payload: { ...match, leagueId: normalizeLeagueId(match.leagueId) },
    kickoff_at: match.kickoffAt || null,
    result_home_score: result?.homeScore ?? null,
    result_away_score: result?.awayScore ?? null,
    is_derby: Boolean(match.isDerby),
    archived: Boolean(archived),
    updated_at: new Date().toISOString()
  };
}

function scoringHash(leagueId, matches) {
  return stableHash({
    leagueId,
    matches: [...matches]
      .map((match) => ({
        id: String(match.id),
        kickoffAt: String(match.kickoffAt || ""),
        result: resultForMatch(match),
        isDerby: Boolean(match.isDerby)
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  });
}

function migrationFingerprint(players, predictions) {
  return stableHash({
    players: [...players]
      .map((player) => [
        String(player.id),
        String(player.nickname),
        String(player.nicknameKey || player.nickname_key || ""),
        String(player.recoveryHash || player.recovery_hash || "")
      ])
      .sort((left, right) => left[0].localeCompare(right[0])),
    predictions: [...predictions]
      .map((prediction) => [
        String(prediction.playerId || prediction.player_id),
        normalizeLeagueId(prediction.leagueId || prediction.league_id),
        String(prediction.matchId || prediction.match_id),
        Number(prediction.homeScore ?? prediction.home_score),
        Number(prediction.awayScore ?? prediction.away_score)
      ])
      .sort((left, right) =>
        left[0].localeCompare(right[0]) ||
        left[1].localeCompare(right[1]) ||
        left[2].localeCompare(right[2])
      )
  });
}

function createLeagueRelationalStorage(options = {}) {
  const enabled = Boolean(options.enabled && options.url);
  const url = String(options.url || "").replace(/\/$/, "");
  const requestHeaders = options.requestHeaders || ((extra) => extra);
  const logger = options.logger || console;
  let availability;
  let migrationPromise;
  let contentSyncPromise = Promise.resolve();
  const scoringPromises = new Map();

  async function request(path, requestOptions = {}) {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method: requestOptions.method || "GET",
      headers: requestHeaders({
        Accept: "application/json",
        ...(requestOptions.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(requestOptions.prefer ? { Prefer: requestOptions.prefer } : {}),
        ...(requestOptions.range ? { Range: requestOptions.range } : {}),
        ...(requestOptions.headers || {})
      }),
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
    });
    if (requestOptions.allowMissing && (response.status === 404 || response.status === 406)) {
      return { missing: true, rows: [], response };
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      const error = new Error(`Prediction League database request failed (${response.status})${detail ? `: ${detail}` : ""}`);
      error.statusCode = response.status;
      throw error;
    }
    const text = await response.text();
    return {
      missing: false,
      rows: text ? JSON.parse(text) : [],
      response
    };
  }

  async function probe() {
    if (!enabled) return false;
    if (availability !== undefined) return availability;
    try {
      const result = await request("league_storage_meta?select=key&limit=1", { allowMissing: true });
      availability = !result.missing;
    } catch (error) {
      logger.warn(`Relational Prediction League storage unavailable: ${error.message}`);
      availability = false;
    }
    return availability;
  }

  async function selectAll(path, pageSize = 1000) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const result = await request(path, { range: `${offset}-${offset + pageSize - 1}` });
      rows.push(...result.rows);
      if (result.rows.length < pageSize) break;
    }
    return rows;
  }

  async function writeBatches(table, rows, onConflict) {
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      await request(`${table}${onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : ""}`, {
        method: "POST",
        body: batch,
        prefer: onConflict ? "resolution=merge-duplicates,return=minimal" : "return=minimal"
      });
    }
  }

  async function meta(key) {
    const result = await request(`league_storage_meta?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    return result.rows[0]?.value;
  }

  async function setMeta(key, value) {
    await request("league_storage_meta?on_conflict=key", {
      method: "POST",
      body: [{ key, value, updated_at: new Date().toISOString() }],
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }

  function allConfiguredMatchRows(content, archivedMatches = []) {
    const active = allCollectionMatches(content?.predictionLeague || {}).map((match) => matchRow(match, false));
    const activeKeys = new Set(active.map((row) => `${row.league_id}:${row.match_id}`));
    const archived = normalizeLeagueStore({ archivedMatches }).archivedMatches
      .map((match) => matchRow({ ...match, leagueId: normalizeLeagueId(match.leagueId) }, true))
      .filter((row) => !activeKeys.has(`${row.league_id}:${row.match_id}`));
    return [...active, ...archived];
  }

  async function syncDefinitions(content) {
    const collection = normalizeLeagueCollection(content?.predictionLeague || {});
    const now = new Date().toISOString();
    const rows = collection.leagues.map((league) => ({
      id: league.id,
      payload: league,
      enabled: collection.enabled && league.enabled,
      deleted_at: null,
      updated_at: now
    }));
    if (rows.length) await writeBatches("league_definitions", rows, "id");
    const existing = await selectAll("league_definitions?select=id,deleted_at");
    const activeIds = new Set(rows.map((row) => row.id));
    const removed = existing.filter((row) => !activeIds.has(row.id) && !row.deleted_at);
    for (const row of removed) {
      await request(`league_definitions?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: { enabled: false, deleted_at: now, updated_at: now },
        prefer: "return=minimal"
      });
    }
  }

  async function syncMatches(content, importedArchivedMatches = []) {
    const nextRows = allConfiguredMatchRows(content, importedArchivedMatches);
    const nextKeys = new Set(nextRows.map((row) => `${row.league_id}:${row.match_id}`));
    const existing = await selectAll("league_matches?select=*");

    for (const row of existing) {
      const key = `${row.league_id}:${row.match_id}`;
      if (nextKeys.has(key)) continue;
      const settled = row.result_home_score !== null && row.result_away_score !== null;
      if (settled || row.archived) {
        nextRows.push({ ...row, archived: true, updated_at: new Date().toISOString() });
        nextKeys.add(key);
        continue;
      }
      await request(`league_predictions?league_id=eq.${encodeURIComponent(row.league_id)}&match_id=eq.${encodeURIComponent(row.match_id)}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
      await request(`league_matches?league_id=eq.${encodeURIComponent(row.league_id)}&match_id=eq.${encodeURIComponent(row.match_id)}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
    }
    if (nextRows.length) await writeBatches("league_matches", nextRows, "league_id,match_id");
  }

  async function prepareContent(content) {
    await syncDefinitions(content);
    const rows = allConfiguredMatchRows(content);
    if (rows.length) await writeBatches("league_matches", rows, "league_id,match_id");
  }

  async function countRows(table) {
    const result = await request(`${table}?select=*&limit=1`, {
      headers: { Prefer: "count=exact" },
      range: "0-0"
    });
    const range = result.response.headers.get("content-range") || "";
    const count = Number(range.split("/")[1]);
    return Number.isFinite(count) ? count : result.rows.length;
  }

  async function migrate(content, rawLegacyStore) {
    const store = normalizeLeagueStore(rawLegacyStore);
    await setMeta(MIGRATION_KEY, {
      status: "importing",
      startedAt: new Date().toISOString(),
      legacyHash: stableHash(store),
      legacyCounts: { players: store.players.length, predictions: store.predictions.length }
    });

    await syncDefinitions(content);
    const initialMatchRows = allConfiguredMatchRows(content, store.archivedMatches);
    const knownMatchKeys = new Set(initialMatchRows.map((row) => `${row.league_id}:${row.match_id}`));
    store.predictions.forEach((prediction) => {
      const leagueId = normalizeLeagueId(prediction.leagueId);
      const key = `${leagueId}:${prediction.matchId}`;
      if (knownMatchKeys.has(key)) return;
      initialMatchRows.push(matchRow({
        id: String(prediction.matchId),
        leagueId,
        homeTeam: "Архивиран мач",
        awayTeam: "Архивиран мач",
        kickoffAt: "",
        result: null,
        orphaned: true
      }, true));
      knownMatchKeys.add(key);
    });
    if (initialMatchRows.length) await writeBatches("league_matches", initialMatchRows, "league_id,match_id");

    const playerRows = store.players.map((player) => snakePlayer({
      ...player,
      nicknameKey: player.nicknameKey || String(player.nickname || "").normalize("NFKC").toLocaleLowerCase("bg-BG").replace(/[._\s-]+/gu, ""),
      recoveryHash: player.recoveryHash || crypto.createHash("sha256").update(`unrecoverable:${player.id}`).digest("hex")
    }));
    if (playerRows.length) await writeBatches("league_players", playerRows, "id");
    const predictionRows = store.predictions.map(snakePrediction);
    if (predictionRows.length) await writeBatches("league_predictions", predictionRows, "player_id,league_id,match_id");

    const [storedPlayerRows, storedPredictionRows, playerCount, predictionCount] = await Promise.all([
      selectAll("league_players?select=id,nickname,nickname_key,recovery_hash"),
      selectAll("league_predictions?select=player_id,league_id,match_id,home_score,away_score"),
      countRows("league_players"),
      countRows("league_predictions")
    ]);
    const expectedFingerprint = migrationFingerprint(playerRows, predictionRows);
    const storedFingerprint = migrationFingerprint(storedPlayerRows, storedPredictionRows);
    if (
      playerCount !== store.players.length ||
      predictionCount !== store.predictions.length ||
      storedFingerprint !== expectedFingerprint
    ) {
      throw new Error(`Relational migration verification failed (${playerCount}/${store.players.length} players, ${predictionCount}/${store.predictions.length} predictions)`);
    }

    await setMeta(MIGRATION_KEY, {
      status: "complete",
      completedAt: new Date().toISOString(),
      legacyHash: stableHash(store),
      legacyCounts: { players: store.players.length, predictions: store.predictions.length },
      relationalCounts: { players: playerCount, predictions: predictionCount },
      verifiedFingerprint: storedFingerprint
    });
  }

  async function ensureReady(content, legacyStoreReader) {
    if (!(await probe())) return false;
    if (!migrationPromise) {
      migrationPromise = (async () => {
        const state = await meta(MIGRATION_KEY);
        if (state?.status !== "complete") {
          const legacyStore = await legacyStoreReader();
          await migrate(content, legacyStore);
        }
        await ensureContent(content);
        return true;
      })().catch((error) => {
        migrationPromise = null;
        throw error;
      });
    }
    return migrationPromise;
  }

  async function ensureContent(content) {
    const nextHash = stableHash(content?.predictionLeague || {});
    const current = await meta(CONTENT_KEY);
    if (current?.hash === nextHash) return;
    const run = contentSyncPromise.then(async () => {
      const latest = await meta(CONTENT_KEY);
      if (latest?.hash === nextHash) return;
      await syncDefinitions(content);
      await syncMatches(content);
      await setMeta(CONTENT_KEY, { hash: nextHash, syncedAt: new Date().toISOString() });
    });
    contentSyncPromise = run.catch(() => undefined);
    await run;
  }

  async function players() {
    return (await selectAll("league_players?select=*")).map(camelPlayer);
  }

  async function player(playerId) {
    if (!playerId) return null;
    const result = await request(`league_players?id=eq.${encodeURIComponent(playerId)}&select=*&limit=1`);
    return result.rows[0] ? camelPlayer(result.rows[0]) : null;
  }

  async function playerByRecoveryHash(recoveryHash) {
    const result = await request(`league_players?recovery_hash=eq.${encodeURIComponent(recoveryHash)}&select=*&limit=1`);
    return result.rows[0] ? camelPlayer(result.rows[0]) : null;
  }

  async function playerByNicknameKey(nicknameKey) {
    const result = await request(`league_players?nickname_key=eq.${encodeURIComponent(nicknameKey)}&select=*&limit=1`);
    return result.rows[0] ? camelPlayer(result.rows[0]) : null;
  }

  async function createPlayer(playerValue) {
    const result = await request("league_players", {
      method: "POST",
      body: [snakePlayer(playerValue)],
      prefer: "return=representation"
    });
    return camelPlayer(result.rows[0]);
  }

  async function updatePlayer(playerId, changes = {}) {
    const body = { updated_at: new Date().toISOString() };
    if (changes.nickname !== undefined) body.nickname = changes.nickname;
    if (changes.nicknameKey !== undefined) body.nickname_key = changes.nicknameKey;
    if (changes.recoveryHash !== undefined) body.recovery_hash = changes.recoveryHash;
    const result = await request(`league_players?id=eq.${encodeURIComponent(playerId)}`, {
      method: "PATCH",
      body,
      prefer: "return=representation"
    });
    return result.rows[0] ? camelPlayer(result.rows[0]) : null;
  }

  async function upsertPrediction(prediction) {
    const result = await request("rpc/league_save_prediction", {
      method: "POST",
      body: {
        p_player_id: String(prediction.playerId),
        p_league_id: normalizeLeagueId(prediction.leagueId),
        p_match_id: String(prediction.matchId),
        p_home_score: Number(prediction.homeScore),
        p_away_score: Number(prediction.awayScore),
        p_now: prediction.updatedAt || new Date().toISOString()
      }
    });
    return camelPrediction(Array.isArray(result.rows) ? result.rows[0] : result.rows);
  }

  function scoringConfigFor(content, leagueId, archivedMatches) {
    const collection = normalizeLeagueCollection(content?.predictionLeague || {});
    const league = collection.leagues.find((item) => item.id === leagueId);
    const allMatches = allCollectionMatches(content.predictionLeague)
      .filter((match) => match.leagueId === leagueId);
    return {
      ...(league || { id: leagueId, title: "Архивирана лига", trophies: [] }),
      id: leagueId,
      matches: allMatches,
      archivedMatches
    };
  }

  async function ensureScoring(content, leagueId) {
    if (scoringPromises.has(leagueId)) return scoringPromises.get(leagueId);
    const operation = (async () => {
      const archivedRows = await selectAll(
        `league_matches?league_id=eq.${encodeURIComponent(leagueId)}&archived=eq.true&select=payload`
      );
      const archivedMatches = archivedRows.map((row) => row.payload);
      const config = scoringConfigFor(content, leagueId, archivedMatches);
      const hash = scoringHash(leagueId, [...config.matches, ...archivedMatches]);
      const active = await request(
        `league_scoring_versions?league_id=eq.${encodeURIComponent(leagueId)}&status=eq.active&select=id,config_hash&limit=1`
      );
      if (active.rows[0]?.config_hash === hash) return active.rows[0].id;

      const [allPlayers, predictionRows] = await Promise.all([
        players(),
        selectAll(`league_predictions?league_id=eq.${encodeURIComponent(leagueId)}&select=*`)
      ]);
      const store = {
        players: allPlayers,
        predictions: predictionRows.map(camelPrediction),
        archivedMatches
      };
      const scoreRows = buildLeagueScoreRows(config, store);
      const versionResult = await request("league_scoring_versions?on_conflict=league_id,config_hash", {
        method: "POST",
        body: [{ league_id: leagueId, config_hash: hash, status: "building" }],
        prefer: "resolution=merge-duplicates,return=representation"
      });
      const versionId = versionResult.rows[0].id;
      await request(`league_score_events?version_id=eq.${encodeURIComponent(versionId)}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
      if (scoreRows.length) {
        await writeBatches("league_score_events", scoreRows.map((row) => ({
          version_id: versionId,
          player_id: row.playerId,
          match_id: row.matchId,
          kickoff_at: row.kickoffAt,
          points: row.points,
          outcome_points: row.outcomePoints,
          exact_score_points: row.exactScorePoints,
          streak_bonus: row.streakBonus,
          correct_outcome: row.correctOutcome,
          exact_score: row.exactScore,
          derby_correct: row.derbyCorrect,
          streak_after: row.streakAfter
        })), "version_id,player_id,match_id");
      }
      try {
        await request("rpc/league_activate_scoring_version", {
          method: "POST",
          body: { p_version_id: versionId }
        });
      } catch (error) {
        const nowActive = await request(
          `league_scoring_versions?league_id=eq.${encodeURIComponent(leagueId)}&status=eq.active&config_hash=eq.${encodeURIComponent(hash)}&select=id&limit=1`
        );
        if (!nowActive.rows[0]) throw error;
      }
      await request(`league_scoring_versions?league_id=eq.${encodeURIComponent(leagueId)}&status=eq.retired`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
      return versionId;
    })().finally(() => scoringPromises.delete(leagueId));
    scoringPromises.set(leagueId, operation);
    return operation;
  }

  async function stateData(content, playerId, leagueId, now = Date.now()) {
    await ensureContent(content);
    const scoringLeagueResult = await request("rpc/league_ids_for_scoring", { method: "POST", body: {} });
    const scoringLeagueIds = scoringLeagueResult.rows.map((row) => row.league_id);
    for (const scoringLeagueId of scoringLeagueIds) await ensureScoring(content, scoringLeagueId);
    const activeVersion = await request(
      `league_scoring_versions?league_id=eq.${encodeURIComponent(leagueId)}&status=eq.active&select=id&limit=1`
    );
    const versionId = activeVersion.rows[0]?.id || null;
    const ranges = periodRanges(now);
    const body = {
      p_league_id: leagueId,
      p_week_start: new Date(ranges.week[0]).toISOString(),
      p_week_end: new Date(ranges.week[1]).toISOString(),
      p_month_start: new Date(ranges.month[0]).toISOString(),
      p_month_end: new Date(ranges.month[1]).toISOString()
    };
    const aggregatePromise = request("rpc/league_leaderboard_rows", { method: "POST", body });
    const predictionPromise = playerId
      ? selectAll(`league_predictions?player_id=eq.${encodeURIComponent(playerId)}&league_id=eq.${encodeURIComponent(leagueId)}&select=*`)
      : Promise.resolve([]);
    const scoresPromise = playerId && versionId
      ? selectAll(`league_score_events?version_id=eq.${encodeURIComponent(versionId)}&player_id=eq.${encodeURIComponent(playerId)}&select=*`)
      : Promise.resolve([]);
    const participationPromise = playerId
      ? request("rpc/league_player_participation", { method: "POST", body: { p_player_id: playerId } })
      : Promise.resolve({ rows: [] });
    const [aggregateResult, predictionRows, scoreRows, participationResult] = await Promise.all([
      aggregatePromise,
      predictionPromise,
      scoresPromise,
      participationPromise
    ]);
    return {
      aggregates: aggregateResult.rows.map((row) => ({
        playerId: row.player_id,
        nickname: row.nickname,
        totalPredictions: row.total_predictions,
        weekPredictions: row.week_predictions,
        monthPredictions: row.month_predictions,
        totalPoints: row.total_points,
        weekPoints: row.week_points,
        monthPoints: row.month_points,
        totalExactScores: row.total_exact_scores,
        weekExactScores: row.week_exact_scores,
        monthExactScores: row.month_exact_scores,
        totalCorrectOutcomes: row.total_correct_outcomes,
        weekCorrectOutcomes: row.week_correct_outcomes,
        monthCorrectOutcomes: row.month_correct_outcomes,
        derbyCorrect: row.derby_correct,
        currentStreak: row.current_streak,
        maxStreak: row.max_streak,
        completedPredictions: row.completed_predictions,
        globalCompletedPredictions: row.global_completed_predictions
      })),
      predictions: predictionRows.map(camelPrediction),
      scoreEvents: scoreRows.map((row) => ({
        matchId: row.match_id,
        points: row.points,
        outcomePoints: row.outcome_points,
        exactScorePoints: row.exact_score_points,
        streakBonus: row.streak_bonus,
        correctOutcome: row.correct_outcome,
        exactScore: row.exact_score,
        streakAfter: row.streak_after
      })),
      participation: Object.fromEntries(participationResult.rows.map((row) => [row.league_id, Number(row.prediction_count) || 0]))
    };
  }

  async function archivedExternalEventKeys() {
    const rows = await selectAll("league_matches?archived=eq.true&select=league_id,payload");
    return new Set(rows.flatMap((row) => {
      const eventId = Number(row.payload?.externalEventId);
      return Number.isInteger(eventId) && eventId > 0 ? [`${row.league_id}:${eventId}`] : [];
    }));
  }

  async function usage() {
    const result = await request("rpc/league_database_usage", { method: "POST", body: {} });
    const row = result.rows[0] || {};
    return {
      databaseBytes: Number(row.database_bytes) || 0,
      leagueTablesBytes: Number(row.league_tables_bytes) || 0,
      predictionsBytes: Number(row.predictions_bytes) || 0,
      scoreEventsBytes: Number(row.score_events_bytes) || 0,
      freePlanLimitBytes: 500 * 1024 * 1024
    };
  }

  return {
    archivedExternalEventKeys,
    createPlayer,
    ensureContent,
    ensureReady,
    ensureScoring,
    player,
    playerByRecoveryHash,
    playerByNicknameKey,
    players,
    prepareContent,
    probe,
    stateData,
    syncMatches,
    updatePlayer,
    upsertPrediction,
    usage
  };
}

module.exports = {
  createLeagueRelationalStorage,
  stableHash
};
