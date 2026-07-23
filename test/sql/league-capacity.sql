\set ON_ERROR_STOP on
\timing on

truncate table
  public.league_score_events,
  public.league_scoring_versions,
  public.league_predictions,
  public.league_matches,
  public.league_definitions,
  public.league_career_rollups,
  public.league_players
restart identity cascade;

insert into public.league_players (id, nickname, nickname_key, recovery_hash)
select
  md5('player-' || player_no)::uuid,
  'PLAYER' || lpad(player_no::text, 3, '0'),
  'player' || lpad(player_no::text, 3, '0'),
  md5('recovery-a-' || player_no) || md5('recovery-b-' || player_no)
from generate_series(1, 100) as player_no;

insert into public.league_definitions (id, payload)
select 'league-' || league_no, jsonb_build_object('id', 'league-' || league_no)
from generate_series(1, 5) as league_no;

insert into public.league_matches (
  league_id, match_id, payload, kickoff_at,
  result_home_score, result_away_score, is_derby
)
select
  'league-' || league_no,
  'match-' || match_no,
  jsonb_build_object('id', 'match-' || match_no),
  '2025-01-01T00:00:00Z'::timestamptz + match_no * interval '1 hour',
  match_no % 5,
  (match_no * 3) % 4,
  match_no % 25 = 0
from generate_series(1, 5) as league_no
cross join generate_series(1, 1000) as match_no;

insert into public.league_predictions (
  player_id, league_id, match_id, home_score, away_score, submitted_at, updated_at
)
select
  md5('player-' || player_no)::uuid,
  'league-' || league_no,
  'match-' || match_no,
  (player_no + match_no) % 5,
  (player_no + match_no * 2) % 4,
  '2024-12-01T00:00:00Z'::timestamptz,
  '2024-12-01T00:00:00Z'::timestamptz
from generate_series(1, 100) as player_no
cross join generate_series(1, 5) as league_no
cross join generate_series(1, 1000) as match_no;

insert into public.league_scoring_versions (id, league_id, config_hash, status, activated_at)
select
  md5('version-' || league_no)::uuid,
  'league-' || league_no,
  md5('config-a-' || league_no) || md5('config-b-' || league_no),
  'active',
  now()
from generate_series(1, 5) as league_no;

insert into public.league_score_events (
  version_id, player_id, match_id, kickoff_at, points,
  outcome_points, exact_score_points, streak_bonus,
  correct_outcome, exact_score, derby_correct, streak_after
)
select
  md5('version-' || league_no)::uuid,
  md5('player-' || player_no)::uuid,
  'match-' || match_no,
  '2025-01-01T00:00:00Z'::timestamptz + match_no * interval '1 hour',
  case when (player_no + match_no) % 3 = 0 then 3 else 0 end,
  case when (player_no + match_no) % 3 = 0 then 3 else 0 end,
  0,
  0,
  (player_no + match_no) % 3 = 0,
  false,
  match_no % 25 = 0 and (player_no + match_no) % 3 = 0,
  case when (player_no + match_no) % 3 = 0 then 1 else 0 end
from generate_series(1, 100) as player_no
cross join generate_series(1, 5) as league_no
cross join generate_series(1, 1000) as match_no;

analyze public.league_predictions;
analyze public.league_score_events;

select
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  pg_size_pretty(sum(pg_total_relation_size(format('public.%I', table_name)::regclass))) as league_tables_size
from information_schema.tables
where table_schema = 'public'
  and table_name like 'league_%';

select
  relname,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_statio_user_tables
where schemaname = 'public' and relname like 'league_%'
order by pg_total_relation_size(relid) desc;

select count(*) as leaderboard_players
from public.league_leaderboard_rows(
  'league-1',
  '2025-01-06T00:00:00Z',
  '2025-01-13T00:00:00Z',
  '2025-01-01T00:00:00Z',
  '2025-02-01T00:00:00Z'
);
