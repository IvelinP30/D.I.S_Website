function encode(value) {
  return encodeURIComponent(String(value || ""));
}

function rowToEntry(row = {}) {
  return {
    id: row.id,
    giveawayId: row.giveaway_id,
    name: row.name,
    email: row.email,
    socialHandle: row.social_handle || "",
    emailHash: row.email_hash,
    browserHash: row.browser_hash,
    rulesHash: row.rules_hash,
    eligible: row.eligible !== false,
    winnerRank: row.winner_rank === null ? null : Number(row.winner_rank),
    prizeId: row.prize_id || "",
    prizeName: row.prize_name || "",
    prizeImage: row.prize_image || "",
    drawnAt: row.drawn_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function entryToRow(entry = {}) {
  return {
    id: entry.id,
    giveaway_id: entry.giveawayId,
    name: entry.name,
    email: entry.email,
    social_handle: entry.socialHandle || "",
    email_hash: entry.emailHash,
    browser_hash: entry.browserHash,
    rules_hash: entry.rulesHash,
    eligible: entry.eligible !== false,
    winner_rank: entry.winnerRank || null,
    prize_id: entry.prizeId || "",
    prize_name: entry.prizeName || "",
    prize_image: entry.prizeImage || "",
    drawn_at: entry.drawnAt || null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt || entry.createdAt
  };
}

function createGiveawayRelationalStorage(options = {}) {
  const enabled = Boolean(options.enabled && options.url);
  const url = String(options.url || "").replace(/\/$/, "");
  const requestHeaders = options.requestHeaders || ((extra) => extra);
  const fetchImpl = options.fetchImpl || fetch;
  const logger = options.logger || console;
  let availability;

  async function request(path, requestOptions = {}) {
    const response = await fetchImpl(`${url}/rest/v1/${path}`, {
      method: requestOptions.method || "GET",
      headers: requestHeaders({
        Accept: "application/json",
        ...(requestOptions.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(requestOptions.prefer ? { Prefer: requestOptions.prefer } : {})
      }),
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
    });
    if (requestOptions.allowMissing && (response.status === 404 || response.status === 406)) {
      return { missing: true, rows: [] };
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      const error = new Error(`Giveaway database request failed (${response.status})${detail ? `: ${detail}` : ""}`);
      error.statusCode = response.status;
      throw error;
    }
    const text = await response.text();
    return { missing: false, rows: text ? JSON.parse(text) : [] };
  }

  async function probe() {
    if (!enabled) return false;
    if (availability === true) return true;
    try {
      const result = await request("giveaway_entries?select=id&limit=1", { allowMissing: true });
      availability = !result.missing;
    } catch (error) {
      logger.warn(`Relational giveaway storage unavailable: ${error.message}`);
      throw error;
    }
    return availability;
  }

  async function createEntry(entry) {
    const result = await request("giveaway_entries", {
      method: "POST",
      body: [entryToRow(entry)],
      prefer: "return=representation"
    });
    return rowToEntry(result.rows[0]);
  }

  async function entries(giveawayId) {
    const result = await request(
      `giveaway_entries?giveaway_id=eq.${encode(giveawayId)}&select=*&order=created_at.desc`
    );
    return result.rows.map(rowToEntry);
  }

  async function entry(entryId) {
    const result = await request(`giveaway_entries?id=eq.${encode(entryId)}&select=*&limit=1`);
    return result.rows[0] ? rowToEntry(result.rows[0]) : null;
  }

  async function participantCount(giveawayId) {
    const result = await request("rpc/giveaway_participant_count", {
      method: "POST",
      body: { p_giveaway_id: giveawayId }
    });
    return Number(result.rows) || 0;
  }

  async function setEligibility(entryId, eligible) {
    const now = new Date().toISOString();
    const result = await request(
      `giveaway_entries?id=eq.${encode(entryId)}&winner_rank=is.null`,
      {
        method: "PATCH",
        body: { eligible: Boolean(eligible), updated_at: now },
        prefer: "return=representation"
      }
    );
    return result.rows[0] ? rowToEntry(result.rows[0]) : null;
  }

  async function deleteEntry(entryId) {
    const result = await request(
      `giveaway_entries?id=eq.${encode(entryId)}&winner_rank=is.null`,
      { method: "DELETE", prefer: "return=representation" }
    );
    return Boolean(result.rows.length);
  }

  async function deleteGiveaway(giveawayId) {
    await request(`giveaway_entries?giveaway_id=eq.${encode(giveawayId)}`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
  }

  async function keepOnlyGiveaway(giveawayId) {
    const path = giveawayId
      ? `giveaway_entries?giveaway_id=neq.${encode(giveawayId)}`
      : "giveaway_entries?id=not.is.null";
    await request(path, { method: "DELETE", prefer: "return=minimal" });
  }

  async function assignWinners(giveawayId, assignments, drawnAt) {
    const result = await request("rpc/giveaway_assign_winners", {
      method: "POST",
      body: {
        p_giveaway_id: giveawayId,
        p_assignments: assignments.map((assignment) => ({
          id: assignment.id,
          winner_rank: assignment.winnerRank,
          prize_id: assignment.prizeId || "",
          prize_name: assignment.prizeName || "",
          prize_image: assignment.prizeImage || ""
        })),
        p_drawn_at: drawnAt
      }
    });
    return Number(result.rows) || 0;
  }

  async function resetWinners(giveawayId) {
    await request(
      `giveaway_entries?giveaway_id=eq.${encode(giveawayId)}&winner_rank=not.is.null`,
      {
        method: "PATCH",
        body: {
          winner_rank: null,
          prize_id: "",
          prize_name: "",
          prize_image: "",
          drawn_at: null,
          updated_at: new Date().toISOString()
        },
        prefer: "return=minimal"
      }
    );
  }

  return {
    assignWinners,
    createEntry,
    deleteEntry,
    deleteGiveaway,
    entries,
    entry,
    keepOnlyGiveaway,
    participantCount,
    probe,
    resetWinners,
    setEligibility
  };
}

module.exports = {
  createGiveawayRelationalStorage,
  entryToRow,
  rowToEntry
};
