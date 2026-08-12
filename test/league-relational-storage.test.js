const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { stableHash } = require("../server/league-relational-storage");

const root = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "supabase", "schema.sql"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("relational league schema is additive and preserves the legacy rollback row", () => {
  assert.match(schema, /create table if not exists public\.app_state/);
  assert.match(schema, /legacy predictionLeague app_state row is intentionally left untouched/i);
  assert.doesNotMatch(schema, /drop table[^;]+app_state/i);
  assert.doesNotMatch(schema, /delete from public\.app_state/i);
});

test("relational league data is private, constrained, and protected from cascading player deletion", () => {
  for (const table of [
    "league_storage_meta",
    "league_definitions",
    "league_players",
    "league_matches",
    "league_predictions",
    "league_season_predictions",
    "league_scoring_versions",
    "league_score_events",
    "league_career_rollups"
  ]) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(schema, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"));
  }
  assert.match(schema, /unique \(league_id, config_hash\)/);
  assert.match(schema, /primary key \(player_id, league_id, match_id\)/);
  assert.match(schema, /references public\.league_players\(id\) on delete restrict/);
  assert.doesNotMatch(schema, /references public\.league_players\(id\) on delete cascade/);
});

test("scoring cutover is versioned and prediction writes are atomic", () => {
  assert.match(schema, /league_scoring_versions_one_active/);
  assert.match(schema, /create or replace function public\.league_activate_scoring_version/);
  assert.match(schema, /create or replace function public\.league_save_prediction/);
  assert.match(schema, /create or replace function public\.league_save_season_prediction/);
  assert.match(schema, /on conflict \(player_id, league_id, match_id\) do update/);
  assert.match(schema, /on conflict \(player_id, league_id\) do update/);
  assert.match(schema, /Champion prediction window is closed/);
  assert.match(schema, /set search_path = public/g);
});

test("server keeps an automatic safe fallback and exposes protected storage monitoring", () => {
  assert.match(server, /LEAGUE_STORAGE_MODE/);
  assert.match(server, /Prediction League remains on the safe legacy store/);
  assert.match(server, /\/api\/league\/storage-status/);
  assert.match(server, /if \(!isAuthenticated\(request\)\)/);
});

test("stable hashes ignore object identity and detect data changes", () => {
  assert.equal(stableHash({ a: 1 }), stableHash({ a: 1 }));
  assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }));
});
