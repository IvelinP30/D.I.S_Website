const assert = require("node:assert/strict");
const test = require("node:test");
const {
  cachedTeamMediaSearch,
  normalizeTeamMedia,
  rememberTeamMediaSearch,
  rememberTeamsFromEvents,
  searchTeamMediaCatalog,
  transliterateTeamSearch
} = require("../server/team-media");

test("team search transliterates Bulgarian", () => {
  assert.equal(transliterateTeamSearch("Барселона"), "barselona");
});

test("team media preserves safe TheSportsDB badges and legacy API-Football logos", () => {
  assert.equal(normalizeTeamMedia({ id: 1, logo: "https://evil.example/logo.png", source: "TheSportsDB" }), null);
  assert.deepEqual(normalizeTeamMedia({
    id: 133612,
    name: "Manchester United",
    country: "England",
    logo: "https://r2.thesportsdb.com/images/media/team/badge/united.png",
    source: "TheSportsDB",
    resolvedAt: "2026-07-20T00:00:00.000Z"
  }), {
    id: 133612,
    name: "Manchester United",
    code: "",
    country: "England",
    national: false,
    logo: "https://r2.thesportsdb.com/images/media/team/badge/united.png",
    source: "TheSportsDB",
    resolvedAt: "2026-07-20T00:00:00.000Z"
  });
  assert.equal(normalizeTeamMedia({ id: 33, name: "Legacy", source: "API-Football" }).logo, "https://media.api-sports.io/football/teams/33.png");
});

test("imported round badges build a locally searchable free catalogue", () => {
  const cache = {};
  rememberTeamsFromEvents(cache, [{
    idHomeTeam: "133612",
    strHomeTeam: "Manchester United",
    strHomeTeamBadge: "https://r2.thesportsdb.com/images/media/team/badge/united.png",
    idAwayTeam: "133604",
    strAwayTeam: "Arsenal",
    strAwayTeamBadge: "https://r2.thesportsdb.com/images/media/team/badge/arsenal.png",
    strCountry: "England"
  }], "2026-07-22T00:00:00.000Z");

  const result = searchTeamMediaCatalog("Манчестър Юнайтед", { cache });
  assert.equal(result.results[0].id, 133612);
  assert.equal(result.catalogSize, 2);
});

test("legacy cached searches are migrated into the local team catalogue", () => {
  const cache = { searches: { arsenal: { results: [{ id: 42, name: "Arsenal", source: "API-Football" }] } } };
  const result = searchTeamMediaCatalog("Arsenal", { cache });
  assert.equal(result.results[0].id, 42);
  assert.equal(cache.teams["42"].logo, "https://media.api-sports.io/football/teams/42.png");
});

test("free name-search results and misses are cached for reuse", () => {
  const cache = {};
  const team = {
    id: 134085,
    name: "Levski Sofia",
    country: "Bulgaria",
    logo: "https://r2.thesportsdb.com/images/media/team/badge/levski.png",
    source: "TheSportsDB"
  };
  rememberTeamMediaSearch(cache, "Levski Sofia", [team], "2026-07-22T10:00:00.000Z");
  rememberTeamMediaSearch(cache, "Missing FC", [], "2026-07-22T10:01:00.000Z");

  assert.equal(cachedTeamMediaSearch(cache, "Levski Sofia")[0].id, 134085);
  assert.deepEqual(cachedTeamMediaSearch(cache, "Missing FC"), []);
  assert.equal(cache.teams["134085"].source, "TheSportsDB");
});
