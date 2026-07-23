\set ON_ERROR_STOP on

begin;

insert into public.league_players (id, nickname, nickname_key, recovery_hash)
values
  ('00000000-0000-4000-8000-000000000001', 'ALPHA', 'alpha', repeat('a', 64)),
  ('00000000-0000-4000-8000-000000000002', 'BRAVO', 'bravo', repeat('b', 64));

insert into public.league_matches (
  league_id, match_id, payload, kickoff_at, result_home_score, result_away_score, is_derby
)
values
  ('general', 'm1', '{"id":"m1"}', '2026-07-14T18:00:00Z', 2, 1, true),
  ('general', 'm2', '{"id":"m2"}', '2026-07-16T18:00:00Z', 0, 0, false),
  ('general', 'm3', '{"id":"m3"}', '2026-07-20T18:00:00Z', null, null, false);

select public.league_save_prediction(
  '00000000-0000-4000-8000-000000000001',
  'general',
  'm1',
  2,
  1,
  '2026-07-13T10:00:00Z'
);
select public.league_save_prediction(
  '00000000-0000-4000-8000-000000000001',
  'general',
  'm1',
  1,
  0,
  '2026-07-13T11:00:00Z'
);
select public.league_save_prediction(
  '00000000-0000-4000-8000-000000000002',
  'general',
  'm3',
  1,
  0,
  '2026-07-13T12:00:00Z'
);

do $$
declare
  saved public.league_predictions;
begin
  select * into saved
  from public.league_predictions
  where player_id = '00000000-0000-4000-8000-000000000001'
    and league_id = 'general'
    and match_id = 'm1';
  if saved.submitted_at <> '2026-07-13T10:00:00Z'::timestamptz then
    raise exception 'Atomic upsert replaced submitted_at';
  end if;
  if saved.updated_at <> '2026-07-13T11:00:00Z'::timestamptz then
    raise exception 'Atomic upsert did not update updated_at';
  end if;
end;
$$;

insert into public.league_scoring_versions (id, league_id, config_hash)
values ('10000000-0000-4000-8000-000000000001', 'general', repeat('c', 64));

insert into public.league_score_events (
  version_id, player_id, match_id, kickoff_at, points, outcome_points,
  exact_score_points, streak_bonus, correct_outcome, exact_score,
  derby_correct, streak_after
)
values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'm1',
  '2026-07-14T18:00:00Z',
  3,
  3,
  0,
  0,
  true,
  false,
  true,
  1
);

select public.league_activate_scoring_version('10000000-0000-4000-8000-000000000001');

do $$
declare
  alpha record;
  bravo record;
begin
  select * into alpha
  from public.league_leaderboard_rows(
    'general',
    '2026-07-13T00:00:00Z',
    '2026-07-20T00:00:00Z',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  )
  where nickname = 'ALPHA';
  if alpha.total_predictions <> 1 or alpha.total_points <> 3
     or alpha.global_completed_predictions <> 1 then
    raise exception 'Aggregate state is incorrect for ALPHA';
  end if;

  select * into bravo
  from public.league_leaderboard_rows(
    'general',
    '2026-07-13T00:00:00Z',
    '2026-07-20T00:00:00Z',
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  )
  where nickname = 'BRAVO';
  if bravo.total_predictions <> 1 or bravo.total_points <> 0
     or bravo.global_completed_predictions <> 0 then
    raise exception 'Aggregate state is incorrect for BRAVO';
  end if;

  if has_table_privilege('anon', 'public.league_predictions', 'select') then
    raise exception 'anon must not read predictions';
  end if;
  if has_table_privilege('authenticated', 'public.league_players', 'select') then
    raise exception 'authenticated must not read recovery hashes';
  end if;
end;
$$;

select * from public.league_database_usage();

rollback;
