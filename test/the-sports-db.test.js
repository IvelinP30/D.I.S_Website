const assert = require("node:assert/strict");
const test = require("node:test");
const {
  THE_SPORTS_DB_MINUTE_BUDGET,
  requestTheSportsDb,
  theSportsDbUsageSummary
} = require("../server/the-sports-db");

function response(payload = { events: [] }, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("free TheSportsDB client requests one full round and tracks local usage", async () => {
  const state = {};
  const now = Date.parse("2026-07-22T08:00:00Z");
  let requestedUrl = "";
  const result = await requestTheSportsDb("eventsround.php", { id: 4328, r: 1, s: "2026-2027" }, {
    state,
    now,
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return response({ events: [{ idEvent: "2494000" }] });
    }
  });
  assert.equal(result.events[0].idEvent, "2494000");
  assert.match(requestedUrl, /\/api\/v1\/json\/123\/eventsround\.php/);
  assert.match(requestedUrl, /id=4328/);
  assert.equal(theSportsDbUsageSummary(state, now).used, 1);
});

test("free TheSportsDB client supports one team badge lookup by name", async () => {
  let requestedUrl = "";
  const result = await requestTheSportsDb("searchteams.php", { t: "Levski Sofia" }, {
    state: {},
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return response({ teams: [{ idTeam: "134085", strTeam: "Levski Sofia" }] });
    }
  });

  assert.equal(result.teams[0].idTeam, "134085");
  assert.match(requestedUrl, /searchteams\.php\?t=Levski\+Sofia/);
});

test("free TheSportsDB client blocks bursts below the upstream 30 request limit", async () => {
  const now = Date.parse("2026-07-22T08:00:00Z");
  const state = { usage: { day: "2026-07-22", requests: 20, recentRequests: Array.from({ length: THE_SPORTS_DB_MINUTE_BUDGET }, (_, index) => now + index) } };
  const waits = [];
  const result = await requestTheSportsDb("eventsround.php", { id: 4328, r: 1, s: "2026-2027" }, {
    state, now: now + 100, sleep: async (ms) => waits.push(ms), fetchImpl: async () => response()
  });
  assert.deepEqual(waits, [60_000]);
  assert.equal(result.usage.used, 21);
});

test("rate-limited requests wait for Retry-After and resume the same request", async () => {
  const waits = [];
  const urls = [];
  const state = {};
  await requestTheSportsDb("eventsround.php", { id: 4328, r: 5 }, {
    state, now: Date.parse("2026-07-22T08:00:00Z"), sleep: async (ms) => waits.push(ms),
    fetchImpl: async (url) => {
      urls.push(String(url));
      return urls.length === 1
        ? { ...response({}, 429), headers: new Headers({ "Retry-After": "90" }) }
        : response();
    }
  });
  assert.deepEqual(waits, [90_000]);
  assert.equal(urls.length, 2);
  assert.equal(urls[0], urls[1]);
  assert.equal(state.usage.requests, 2);
});

test("free TheSportsDB client exposes a clear 429 error", async () => {
  await assert.rejects(
    requestTheSportsDb("eventsround.php", { id: 4328, r: 1, s: "2026-2027" }, { state: {}, sleep: async () => {}, fetchImpl: async () => response({}, 429) }),
    (error) => error.code === "THE_SPORTS_DB_RATE_LIMITED" && error.statusCode === 429
  );
});
