const assert = require("node:assert/strict");
const test = require("node:test");
const {
  fetchPressNews,
  fetchPressNewsSet,
  fetchPressNewsWithFallback,
  PRESS_NEWS_CACHE_VERSION,
  mergePressArticles,
  normalizePressArticle,
  pressNewsCacheIsFresh,
  rankPressArticles
} = require("../server/press-news");

test("press news keeps only safe public metadata", () => {
  assert.deepEqual(normalizePressArticle({
    article_id: "story-1",
    title: "<b>Champions League final</b>",
    description: "  A major  football story. ",
    link: "https://example.com/story?ref=feed",
    image_url: "javascript:alert(1)",
    source_name: "Example Sport",
    source_url: "https://example.com",
    pubDate: "2026-07-21 08:00:00"
  }), {
    id: "story-1",
    title: "Champions League final",
    description: "A major football story.",
    articleUrl: "https://example.com/story?ref=feed",
    sourceName: "Example Sport",
    sourceUrl: "https://example.com/",
    publishedAt: "2026-07-21T08:00:00.000Z",
    language: "en",
    country: [],
    sourcePriority: null,
    imageUrl: "",
    imageSourceUrl: "",
    isBulgarianFootball: false
  });
});

test("press news uses pubDate when pubDateTZ contains only the timezone name", () => {
  const item = normalizePressArticle({
    article_id: "timezone-story",
    title: "Football update",
    link: "https://example.com/timezone-story",
    pubDate: "2026-07-21 07:31:50",
    pubDateTZ: "UTC"
  });

  assert.equal(item.publishedAt, "2026-07-21T07:31:50.000Z");
});

test("Bulgarian publisher country alone does not create a Bulgarian-football badge", () => {
  const general = normalizePressArticle({
    article_id: "general-bg-sport",
    title: "Леброн Джеймс с важно решение",
    link: "https://example.com/general-bg-sport",
    country: ["bulgaria"],
    pubDate: "2026-07-21 07:31:50"
  });
  const football = normalizePressArticle({
    article_id: "levski-story",
    title: "Левски започва новия сезон",
    link: "https://example.com/levski-story",
    country: ["bulgaria"],
    pubDate: "2026-07-21 07:31:50"
  });

  assert.equal(general.isBulgarianFootball, false);
  assert.equal(football.isBulgarianFootball, true);
});

test("every targeted request locally removes non-football sports results", async () => {
  const items = await fetchPressNews({
    apiKey: "private-key",
    query: "футбол",
    now: Date.parse("2026-07-21T12:00:00Z"),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        results: [
          { article_id: "basketball", title: "Рич Пол коментира Леброн Джеймс", link: "https://example.com/basketball", pubDate: "2026-07-21T11:30:00Z" },
          { article_id: "football", title: "Меси продължава с Аржентина", link: "https://example.com/messi", pubDate: "2026-07-21T11:00:00Z" }
        ]
      })
    })
  });

  assert.deepEqual(items.map((item) => item.id), ["football"]);
});

test("local football filter rejects multi-sport clubs, lifestyle stories, and wrongly tagged foreign text", async () => {
  const items = await fetchPressNews({
    apiKey: "private-key",
    query: "футбол",
    now: Date.parse("2026-07-21T12:00:00Z"),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        results: [
          { article_id: "basket-real", title: "Реал Мадрид финализира сделката", description: "BasketNews съобщава за ново тежко крило", language: "bulgarian", link: "https://example.com/basket-real", pubDate: "2026-07-21T11:30:00Z" },
          { article_id: "celebrity", title: "Певец отговори на слухове след финала по футбол", description: "Интервю с известния певец", language: "bulgarian", link: "https://example.com/celebrity", pubDate: "2026-07-21T11:20:00Z" },
          { article_id: "foreign", title: "Майдондаги футбол янгиликлари", description: "Жаҳоннинг миллионлаб мухлислари", language: "bulgarian", link: "https://example.com/foreign", pubDate: "2026-07-21T11:10:00Z" },
          { article_id: "chelsea", title: "Челси е близо до нов защитник", description: "Клубът преговаря за футболиста", language: "bulgarian", link: "https://example.com/chelsea", pubDate: "2026-07-21T11:00:00Z" }
        ]
      })
    })
  });

  assert.deepEqual(items.map((item) => item.id), ["chelsea"]);
});

test("Bulgarian club connection can be recognized across the article text", () => {
  const item = normalizePressArticle({
    title: "Талант, роден в Пловдив и израснал в Локомотив",
    description: "Футболистът празнува рожден ден",
    link: "https://example.com/lokomotiv",
    pubDate: "2026-07-21T11:00:00Z"
  });

  assert.equal(item.isBulgarianFootball, true);
});

test("press news retains a safe provider image only as a private cache input", () => {
  const item = normalizePressArticle({
    article_id: "image-story",
    title: "Меси с нов гол",
    link: "https://example.com/image-story",
    image_url: "https://images.example.com/photo.jpg",
    pubDate: "2026-07-21 07:31:50"
  });

  assert.equal(item.imageSourceUrl, "https://images.example.com/photo.jpg");
  assert.equal(item.imageUrl, "");
});

test("press news removes duplicate links and prefers stronger football stories", () => {
  const items = rankPressArticles([
    { title: "Club training update", link: "https://example.com/a", pubDate: "2026-07-21T08:00:00Z" },
    { title: "Champions League final transfer record", link: "https://example.com/b", pubDate: "2026-07-21T07:00:00Z" },
    { title: "Duplicate", link: "https://example.com/b?tracking=1", pubDate: "2026-07-21T09:00:00Z" }
  ], { now: Date.parse("2026-07-21T10:00:00Z") });

  assert.equal(items.length, 2);
  assert.match(items[0].title, /Champions League/);
});

test("press news fetch uses one server-side NewsData request and never returns the key", async () => {
  let requestedUrl = "";
  const items = await fetchPressNews({
    apiKey: "private-key",
    now: Date.parse("2026-07-21T10:00:00Z"),
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          results: [{ article_id: "1", title: "World Cup football update", link: "https://example.com/world-cup", pubDate: "2026-07-21T09:00:00Z" }]
        })
      };
    }
  });

  assert.match(requestedUrl, /apikey=private-key/);
  assert.match(requestedUrl, /category=sports/);
  assert.match(requestedUrl, /language=bg/);
  assert.doesNotMatch(JSON.stringify(items), /private-key/);
});

test("press news drops stories older than 72 hours and caps the visible feed", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");
  const recent = Array.from({ length: 8 }, (_, index) => ({
    article_id: `recent-${index}`,
    title: `Футболна новина ${index}`,
    link: `https://example.com/recent-${index}`,
    pubDate: `2026-07-${String(21 - Math.floor(index / 4)).padStart(2, "0")}T0${index % 4}:00:00Z`
  }));
  const items = rankPressArticles([
    ...recent,
    { article_id: "old", title: "Стара новина", link: "https://example.com/old", pubDate: "2026-07-17T10:00:00Z" }
  ], { now, limit: 6 });

  assert.equal(items.length, 6);
  assert.equal(items.some((item) => item.id === "old"), false);
});

test("press news merges refreshes without deleting headlines younger than 72 hours", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");
  const existing = rankPressArticles([
    { article_id: "kept", title: "Новина от предишното обновяване", link: "https://example.com/kept", pubDate: "2026-07-20T12:00:00Z" },
    { article_id: "expired", title: "Новина извън прозореца", link: "https://example.com/expired", pubDate: "2026-07-18T11:00:00Z" }
  ], { now, limit: 10 });
  const incoming = rankPressArticles([
    { article_id: "new", title: "Нова футболна новина", link: "https://example.com/new", pubDate: "2026-07-21T11:00:00Z" }
  ], { now, limit: 10 });
  const merged = mergePressArticles(existing, incoming, { now, limit: Number.POSITIVE_INFINITY });

  assert.equal(merged.some((item) => item.id === "kept"), true);
  assert.equal(merged.some((item) => item.id === "new"), true);
  assert.equal(merged.some((item) => item.id === "expired"), false);
});

test("the rolling cache does not evict valid headlines just because there are more than forty", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");
  const currentWindow = Array.from({ length: 50 }, (_, index) => ({
    article_id: `story-${index}`,
    title: `Актуална публикация ${index}`,
    link: `https://example.com/story-${index}`,
    pubDate: "2026-07-21T10:00:00Z"
  }));

  const retained = mergePressArticles([], currentWindow, { now, limit: Number.POSITIVE_INFINITY });
  assert.equal(retained.length, 50);
});

test("press news prioritizes Bulgarian football over a newer general story", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");
  const items = rankPressArticles([
    { article_id: "world", title: "Premier League transfer update", link: "https://example.com/world", pubDate: "2026-07-21T11:30:00Z" },
    { article_id: "bg", title: "Левски с важна победа", link: "https://example.com/bg", pubDate: "2026-07-21T06:00:00Z", country: ["bulgaria"] }
  ], { now, limit: 10 });

  assert.equal(items[0].id, "bg");
  assert.equal(items[0].isBulgarianFootball, true);
});

test("the displayed rolling feed always puts the newest publication first", () => {
  const now = Date.parse("2026-07-21T12:00:00Z");
  const items = mergePressArticles([
    { article_id: "bg", title: "Левски с важна победа", link: "https://example.com/bg-newest-test", pubDate: "2026-07-21T06:00:00Z" },
    { article_id: "newer", title: "Обща футболна новина", link: "https://example.com/newer", pubDate: "2026-07-21T11:00:00Z" }
  ], [], { now, limit: Number.POSITIVE_INFINITY, sortMode: "newest" });

  assert.equal(items[0].id, "newer");
});

test("press news set runs priority and general searches and tolerates one failed query", async () => {
  const requestedQueries = [];
  const items = await fetchPressNewsSet({
    apiKey: "private-key",
    queries: ["Левски OR ЦСКА", "футбол"],
    now: Date.parse("2026-07-21T12:00:00Z"),
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get("q");
      requestedQueries.push(query);
      if (query === "футбол") return { ok: false, status: 503, json: async () => ({ status: "error", message: "Unavailable" }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          results: [{ article_id: "bg-1", title: "ЦСКА с нов трансфер", link: "https://example.com/bg-1", pubDate: "2026-07-21T11:00:00Z" }]
        })
      };
    }
  });

  assert.deepEqual(requestedQueries.sort(), ["Левски OR ЦСКА", "футбол"].sort());
  assert.equal(items.length, 1);
});

test("an empty successful NewsData response is not treated as a provider failure", async () => {
  const items = await fetchPressNewsSet({
    apiKey: "private-key",
    queries: ["футбол"],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "success", results: [] })
    })
  });

  assert.deepEqual(items, []);
});

test("press news falls back to Bulgarian sports and locally keeps only football", async () => {
  const requestedQueries = [];
  const items = await fetchPressNewsWithFallback({
    apiKey: "private-key",
    queries: ["Левски", "футбол"],
    now: Date.parse("2026-07-21T12:00:00Z"),
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get("q");
      requestedQueries.push(query);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          results: query ? [] : [
            { article_id: "football", title: "Левски започва новия футболен сезон", link: "https://example.com/football", pubDate: "2026-07-21T11:00:00Z" },
            { article_id: "tennis", title: "Тенис турнир в София", link: "https://example.com/tennis", pubDate: "2026-07-21T11:30:00Z" }
          ]
        })
      };
    }
  });

  assert.deepEqual(requestedQueries.sort(), ["Левски", "футбол", null].sort());
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "football");
});

test("press news uses English football only when every Bulgarian fallback is empty", async () => {
  const requests = [];
  const items = await fetchPressNewsWithFallback({
    apiKey: "private-key",
    queries: ["Левски", "футбол"],
    now: Date.parse("2026-07-21T12:00:00Z"),
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requests.push({ query: parsed.searchParams.get("q"), language: parsed.searchParams.get("language") });
      const isEnglishFallback = parsed.searchParams.get("q") === "football" && parsed.searchParams.get("language") === "en";
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          results: isEnglishFallback
            ? [{ article_id: "world", title: "World football final", link: "https://example.com/world-fallback", pubDate: "2026-07-21T11:00:00Z" }]
            : []
        })
      };
    }
  });

  assert.equal(requests.some((request) => request.query === "football" && request.language === "en"), true);
  assert.equal(items[0].id, "world");
});

test("press news cache expires after twelve hours", () => {
  const cache = { version: PRESS_NEWS_CACHE_VERSION, refreshedAt: "2026-07-21T00:00:00.000Z", items: [{ id: "1" }] };
  assert.equal(pressNewsCacheIsFresh(cache, Date.parse("2026-07-21T11:59:00Z")), true);
  assert.equal(pressNewsCacheIsFresh(cache, Date.parse("2026-07-21T12:01:00Z")), false);
  assert.equal(pressNewsCacheIsFresh({ ...cache, version: PRESS_NEWS_CACHE_VERSION - 1 }, Date.parse("2026-07-21T11:00:00Z")), false);
});
