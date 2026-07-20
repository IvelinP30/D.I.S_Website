const assert = require("node:assert/strict");
const test = require("node:test");
const {
  apiFootballSearchTerms,
  normalizeTeamMedia,
  searchApiFootballTeams,
  transliterateTeamSearch
} = require("../server/team-media");

test("team search transliterates Bulgarian and uses a short typo-tolerant fallback", () => {
  assert.equal(transliterateTeamSearch("Барселона"), "barselona");
  assert.deepEqual(apiFootballSearchTerms("Барселона"), ["Barcelona", "Barc"]);
  assert.deepEqual(apiFootballSearchTerms("Челси"), ["chelsi", "chel"]);
});

test("team media accepts only a numeric API-Football team id and derives the official logo URL", () => {
  assert.equal(normalizeTeamMedia({ id: "bad", logo: "https://example.com/logo.png" }), null);
  assert.deepEqual(normalizeTeamMedia({ id: 33, name: "Manchester United", country: "England", national: false, resolvedAt: "2026-07-20T00:00:00.000Z" }), {
    id: 33,
    name: "Manchester United",
    code: "",
    country: "England",
    national: false,
    logo: "https://media.api-sports.io/football/teams/33.png",
    source: "API-Football",
    resolvedAt: "2026-07-20T00:00:00.000Z"
  });
});

test("team search caches and ranks the selected API response without exposing the API key", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), headers: options.headers });
    return {
      ok: true,
      json: async () => ({
        errors: [],
        response: [
          { team: { id: 529, name: "Barcelona", code: "BAR", country: "Spain", national: false } },
          { team: { id: 715, name: "Barcelona W", code: "BAR", country: "Spain", national: false } }
        ]
      })
    };
  };
  const first = await searchApiFootballTeams("Барселона", { apiKey: "secret-key", fetchImpl, cache: {}, now: 1_000 });
  const second = await searchApiFootballTeams("Барселона", { apiKey: "secret-key", fetchImpl, cache: first.cache, now: 2_000 });

  assert.equal(first.results[0].id, 529);
  assert.equal(second.cacheHit, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers["x-apisports-key"], "secret-key");
  assert.doesNotMatch(JSON.stringify(first.results), /secret-key/);
});
