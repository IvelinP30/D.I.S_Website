const assert = require("node:assert/strict");
const test = require("node:test");
const {
  API_FOOTBALL_DAILY_BUDGET,
  API_FOOTBALL_MINUTE_BUDGET,
  apiFootballUsageSummary,
  requestApiFootball
} = require("../server/api-football");

function response(payload = { errors: [], response: [] }, headers = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => payload
  };
}

test("API-Football client tracks upstream and protected daily usage", async () => {
  const state = {};
  const result = await requestApiFootball("/fixtures", { ids: "1-2" }, {
    apiKey: "secret",
    state,
    now: Date.parse("2026-07-22T08:00:00Z"),
    fetchImpl: async () => response({ errors: [], response: [{ fixture: { id: 1 } }] }, {
      "x-ratelimit-requests-limit": "100",
      "x-ratelimit-requests-remaining": "88"
    })
  });

  assert.equal(result.response[0].fixture.id, 1);
  assert.equal(apiFootballUsageSummary(state, Date.parse("2026-07-22T08:00:01Z")).used, 1);
  assert.equal(result.usage.upstreamRemaining, 88);
  assert.equal(result.usage.remaining, 69);
});

test("API-Football client blocks bursts before the provider limit", async () => {
  const state = {};
  const now = Date.parse("2026-07-22T08:00:00Z");
  for (let index = 0; index < API_FOOTBALL_MINUTE_BUDGET; index += 1) {
    await requestApiFootball("/teams", { search: `team-${index}` }, {
      apiKey: "secret",
      state,
      now: now + index,
      fetchImpl: async () => response()
    });
  }
  await assert.rejects(
    requestApiFootball("/teams", { search: "blocked" }, { apiKey: "secret", state, now: now + 10, fetchImpl: async () => response() }),
    (error) => error.code === "API_FOOTBALL_MINUTE_GUARD"
  );
});

test("API-Football client reserves thirty daily requests", async () => {
  const now = Date.parse("2026-07-22T12:00:00Z");
  const state = { usage: { day: "2026-07-22", requests: API_FOOTBALL_DAILY_BUDGET, recentRequests: [] } };
  await assert.rejects(
    requestApiFootball("/fixtures", { ids: "1" }, { apiKey: "secret", state, now, fetchImpl: async () => response() }),
    (error) => error.code === "API_FOOTBALL_DAILY_GUARD"
  );
});

test("API-Football client treats missing headers as unknown and stops after an upstream zero", async () => {
  const now = Date.parse("2026-07-22T12:00:00Z");
  const state = {};
  const first = await requestApiFootball("/fixtures", { ids: "1" }, {
    apiKey: "secret",
    state,
    now,
    fetchImpl: async () => response()
  });
  assert.equal(first.usage.upstreamRemaining, null);
  state.usage.upstreamRemaining = 0;
  await assert.rejects(
    requestApiFootball("/fixtures", { ids: "2" }, { apiKey: "secret", state, now: now + 1, fetchImpl: async () => response() }),
    (error) => error.code === "API_FOOTBALL_UPSTREAM_GUARD"
  );
});

test("API-Football client returns a clear suspended-account error", async () => {
  await assert.rejects(
    requestApiFootball("/teams", { search: "Barcelona" }, {
      apiKey: "secret",
      state: {},
      fetchImpl: async () => response({ errors: { requests: "Your account is suspended" }, response: [] })
    }),
    (error) => error.code === "API_FOOTBALL_SUSPENDED" && /акаунтът е спрян/.test(error.message)
  );
});
