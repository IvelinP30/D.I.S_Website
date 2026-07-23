const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  createGiveawayRelationalStorage,
  entryToRow,
  rowToEntry
} = require("../server/giveaway-relational-storage");

const root = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "supabase", "schema.sql"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("giveaway schema keeps private entries relational and race-safe", () => {
  assert.match(schema, /create table if not exists public\.giveaway_entries/);
  assert.match(schema, /giveaway_entries_one_email/);
  assert.match(schema, /giveaway_entries_one_browser/);
  assert.match(schema, /giveaway_entries_one_winner_rank/);
  assert.match(schema, /alter table public\.giveaway_entries enable row level security/);
  assert.match(schema, /revoke all on table public\.giveaway_entries from anon, authenticated/);
  assert.match(schema, /create or replace function public\.giveaway_assign_winners/);
  assert.match(schema, /pg_advisory_xact_lock/);
});

test("giveaway API uses relational rows without changing its public endpoints", () => {
  assert.match(server, /createGiveawayRelationalStorage/);
  assert.match(server, /relationalGiveawayStorage\.createEntry/);
  assert.match(server, /relationalGiveawayStorage\.participantCount/);
  assert.match(server, /relationalGiveawayStorage\.assignWinners/);
  assert.match(server, /\/api\/giveaway\/entries/);
  assert.match(server, /\/api\/giveaway\/draw/);
  assert.match(server, /\/api\/giveaway\/reset/);
});

test("giveaway row conversion preserves private hashes and draw state", () => {
  const entry = {
    id: "00000000-0000-4000-8000-000000000001",
    giveawayId: "campaign-1",
    name: "Test Person",
    email: "test@example.com",
    socialHandle: "@test",
    emailHash: "a".repeat(64),
    browserHash: "b".repeat(64),
    rulesHash: "c".repeat(64),
    eligible: true,
    winnerRank: 1,
    prizeId: "ball",
    prizeName: "Football",
    prizeImage: "/ball.webp",
    drawnAt: "2026-07-23T12:00:00.000Z",
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T12:00:00.000Z"
  };
  assert.deepEqual(rowToEntry(entryToRow(entry)), entry);
});

test("participant count uses the protected aggregate RPC", async () => {
  const calls = [];
  const storage = createGiveawayRelationalStorage({
    enabled: true,
    url: "https://example.supabase.co",
    requestHeaders: (headers) => headers,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => "400"
      };
    }
  });
  assert.equal(await storage.participantCount("campaign-1"), 400);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /rpc\/giveaway_participant_count$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_giveaway_id: "campaign-1" });
});

test("giveaway probe falls back only for a missing table and fails closed on operational errors", async () => {
  const silentLogger = { warn() {} };
  const missingStorage = createGiveawayRelationalStorage({
    enabled: true,
    url: "https://example.supabase.co",
    requestHeaders: (headers) => headers,
    logger: silentLogger,
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      text: async () => "missing"
    })
  });
  assert.equal(await missingStorage.probe(), false);

  const failingStorage = createGiveawayRelationalStorage({
    enabled: true,
    url: "https://example.supabase.co",
    requestHeaders: (headers) => headers,
    logger: silentLogger,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      text: async () => "temporarily unavailable"
    })
  });
  await assert.rejects(failingStorage.probe(), /503/);
});
