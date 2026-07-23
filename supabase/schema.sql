create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

insert into storage.buckets (id, name, public)
values ('dis-media', 'dis-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read D.I.S media" on storage.objects;

revoke all on table public.app_state from anon, authenticated;
grant select, insert, update, delete on table public.app_state to service_role;

-- Prediction League v2
--
-- The legacy predictionLeague app_state row is intentionally left untouched.
-- The application imports it idempotently after these tables are available and
-- only switches to relational reads after the import has been verified.

create table if not exists public.league_storage_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.league_definitions (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.league_players (
  id uuid primary key,
  nickname text not null,
  nickname_key text not null unique,
  recovery_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_players_nickname_length check (char_length(nickname) between 3 and 24),
  constraint league_players_recovery_hash check (char_length(recovery_hash) = 64)
);

create table if not exists public.league_matches (
  league_id text not null,
  match_id text not null,
  payload jsonb not null default '{}'::jsonb,
  kickoff_at timestamptz,
  result_home_score smallint,
  result_away_score smallint,
  is_derby boolean not null default false,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (league_id, match_id),
  constraint league_matches_home_score check (result_home_score between 0 and 30),
  constraint league_matches_away_score check (result_away_score between 0 and 30),
  constraint league_matches_complete_result check (
    (result_home_score is null and result_away_score is null)
    or (result_home_score is not null and result_away_score is not null)
  )
);

create table if not exists public.league_predictions (
  player_id uuid not null references public.league_players(id) on delete restrict,
  league_id text not null,
  match_id text not null,
  home_score smallint not null,
  away_score smallint not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, league_id, match_id),
  foreign key (league_id, match_id)
    references public.league_matches(league_id, match_id)
    on update cascade on delete restrict,
  constraint league_predictions_home_score check (home_score between 0 and 30),
  constraint league_predictions_away_score check (away_score between 0 and 30)
);

create table if not exists public.league_scoring_versions (
  id uuid primary key default gen_random_uuid(),
  league_id text not null,
  config_hash text not null,
  status text not null default 'building',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (league_id, config_hash),
  constraint league_scoring_versions_status check (status in ('building', 'active', 'retired'))
);

create unique index if not exists league_scoring_versions_one_active
  on public.league_scoring_versions (league_id)
  where status = 'active';

create table if not exists public.league_score_events (
  version_id uuid not null references public.league_scoring_versions(id) on delete cascade,
  player_id uuid not null references public.league_players(id) on delete restrict,
  match_id text not null,
  kickoff_at timestamptz,
  points smallint not null default 0,
  outcome_points smallint not null default 0,
  exact_score_points smallint not null default 0,
  streak_bonus smallint not null default 0,
  correct_outcome boolean not null default false,
  exact_score boolean not null default false,
  derby_correct boolean not null default false,
  streak_after integer not null default 0,
  primary key (version_id, player_id, match_id),
  constraint league_score_events_nonnegative check (
    points >= 0 and outcome_points >= 0 and exact_score_points >= 0
    and streak_bonus >= 0 and streak_after >= 0
  )
);

-- Only compact totals from intentionally purged, deleted leagues live here.
-- Normal active and soft-deleted league scoring remains auditable per match.
create table if not exists public.league_career_rollups (
  player_id uuid primary key references public.league_players(id) on delete restrict,
  completed_predictions integer not null default 0,
  points integer not null default 0,
  exact_scores integer not null default 0,
  correct_outcomes integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint league_career_rollups_nonnegative check (
    completed_predictions >= 0 and points >= 0
    and exact_scores >= 0 and correct_outcomes >= 0
  )
);

create index if not exists league_predictions_league_player
  on public.league_predictions (league_id, player_id);
create index if not exists league_predictions_league_match
  on public.league_predictions (league_id, match_id);
create index if not exists league_matches_league_kickoff
  on public.league_matches (league_id, kickoff_at);
create index if not exists league_score_events_player
  on public.league_score_events (player_id, version_id);
create index if not exists league_score_events_period
  on public.league_score_events (version_id, kickoff_at);

alter table public.league_storage_meta enable row level security;
alter table public.league_definitions enable row level security;
alter table public.league_players enable row level security;
alter table public.league_matches enable row level security;
alter table public.league_predictions enable row level security;
alter table public.league_scoring_versions enable row level security;
alter table public.league_score_events enable row level security;
alter table public.league_career_rollups enable row level security;

revoke all on table public.league_storage_meta from anon, authenticated;
revoke all on table public.league_definitions from anon, authenticated;
revoke all on table public.league_players from anon, authenticated;
revoke all on table public.league_matches from anon, authenticated;
revoke all on table public.league_predictions from anon, authenticated;
revoke all on table public.league_scoring_versions from anon, authenticated;
revoke all on table public.league_score_events from anon, authenticated;
revoke all on table public.league_career_rollups from anon, authenticated;

grant select, insert, update, delete on table public.league_storage_meta to service_role;
grant select, insert, update, delete on table public.league_definitions to service_role;
grant select, insert, update, delete on table public.league_players to service_role;
grant select, insert, update, delete on table public.league_matches to service_role;
grant select, insert, update, delete on table public.league_predictions to service_role;
grant select, insert, update, delete on table public.league_scoring_versions to service_role;
grant select, insert, update, delete on table public.league_score_events to service_role;
grant select, insert, update, delete on table public.league_career_rollups to service_role;

create or replace function public.league_activate_scoring_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_league_id text;
begin
  select league_id into target_league_id
  from public.league_scoring_versions
  where id = p_version_id and status = 'building'
  for update;

  if target_league_id is null then
    raise exception 'Scoring version is missing or is not buildable';
  end if;

  update public.league_scoring_versions
  set status = 'retired'
  where league_id = target_league_id and status = 'active';

  update public.league_scoring_versions
  set status = 'active', activated_at = now()
  where id = p_version_id;
end;
$$;

drop function if exists public.league_save_prediction(uuid, text, text, smallint, smallint, timestamptz);

create or replace function public.league_save_prediction(
  p_player_id uuid,
  p_league_id text,
  p_match_id text,
  p_home_score integer,
  p_away_score integer,
  p_now timestamptz default now()
)
returns public.league_predictions
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.league_predictions;
begin
  insert into public.league_predictions (
    player_id, league_id, match_id, home_score, away_score, submitted_at, updated_at
  )
  values (
    p_player_id, p_league_id, p_match_id, p_home_score, p_away_score, p_now, p_now
  )
  on conflict (player_id, league_id, match_id) do update
  set
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    updated_at = excluded.updated_at
  returning * into saved;
  return saved;
end;
$$;

create or replace function public.league_leaderboard_rows(
  p_league_id text,
  p_week_start timestamptz,
  p_week_end timestamptz,
  p_month_start timestamptz,
  p_month_end timestamptz
)
returns table (
  player_id uuid,
  nickname text,
  total_predictions bigint,
  week_predictions bigint,
  month_predictions bigint,
  total_points bigint,
  week_points bigint,
  month_points bigint,
  total_exact_scores bigint,
  week_exact_scores bigint,
  month_exact_scores bigint,
  total_correct_outcomes bigint,
  week_correct_outcomes bigint,
  month_correct_outcomes bigint,
  derby_correct bigint,
  current_streak integer,
  max_streak integer,
  completed_predictions bigint,
  global_completed_predictions bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with prediction_totals as (
    select
      p.player_id,
      count(*) as total_predictions,
      count(*) filter (where m.kickoff_at >= p_week_start and m.kickoff_at < p_week_end) as week_predictions,
      count(*) filter (where m.kickoff_at >= p_month_start and m.kickoff_at < p_month_end) as month_predictions
    from public.league_predictions p
    join public.league_matches m
      on m.league_id = p.league_id and m.match_id = p.match_id
    where p.league_id = p_league_id
      and coalesce((m.payload->>'orphaned')::boolean, false) = false
    group by p.player_id
  ),
  active_scores as (
    select e.*
    from public.league_score_events e
    join public.league_scoring_versions v on v.id = e.version_id
    where v.league_id = p_league_id and v.status = 'active'
  ),
  score_totals as (
    select
      e.player_id,
      count(*) as completed_predictions,
      coalesce(sum(e.points), 0) as total_points,
      coalesce(sum(e.points) filter (where e.kickoff_at >= p_week_start and e.kickoff_at < p_week_end), 0) as week_points,
      coalesce(sum(e.points) filter (where e.kickoff_at >= p_month_start and e.kickoff_at < p_month_end), 0) as month_points,
      count(*) filter (where e.exact_score) as total_exact_scores,
      count(*) filter (where e.exact_score and e.kickoff_at >= p_week_start and e.kickoff_at < p_week_end) as week_exact_scores,
      count(*) filter (where e.exact_score and e.kickoff_at >= p_month_start and e.kickoff_at < p_month_end) as month_exact_scores,
      count(*) filter (where e.correct_outcome) as total_correct_outcomes,
      count(*) filter (where e.correct_outcome and e.kickoff_at >= p_week_start and e.kickoff_at < p_week_end) as week_correct_outcomes,
      count(*) filter (where e.correct_outcome and e.kickoff_at >= p_month_start and e.kickoff_at < p_month_end) as month_correct_outcomes,
      count(*) filter (where e.derby_correct) as derby_correct,
      coalesce(max(e.streak_after), 0) as max_streak,
      coalesce((array_agg(e.streak_after order by e.kickoff_at desc nulls last, e.match_id desc))[1], 0) as current_streak
    from active_scores e
    group by e.player_id
  ),
  global_scores as (
    select player_id, count(*) as completed_predictions
    from public.league_score_events e
    join public.league_scoring_versions v on v.id = e.version_id
    where v.status = 'active'
    group by player_id
  )
  select
    p.id as player_id,
    p.nickname,
    coalesce(pt.total_predictions, 0)::bigint,
    coalesce(pt.week_predictions, 0)::bigint,
    coalesce(pt.month_predictions, 0)::bigint,
    coalesce(st.total_points, 0)::bigint,
    coalesce(st.week_points, 0)::bigint,
    coalesce(st.month_points, 0)::bigint,
    coalesce(st.total_exact_scores, 0)::bigint,
    coalesce(st.week_exact_scores, 0)::bigint,
    coalesce(st.month_exact_scores, 0)::bigint,
    coalesce(st.total_correct_outcomes, 0)::bigint,
    coalesce(st.week_correct_outcomes, 0)::bigint,
    coalesce(st.month_correct_outcomes, 0)::bigint,
    coalesce(st.derby_correct, 0)::bigint,
    coalesce(st.current_streak, 0)::integer,
    coalesce(st.max_streak, 0)::integer,
    coalesce(st.completed_predictions, 0)::bigint,
    (coalesce(gs.completed_predictions, 0) + coalesce(cr.completed_predictions, 0))::bigint
  from public.league_players p
  left join prediction_totals pt on pt.player_id = p.id
  left join score_totals st on st.player_id = p.id
  left join global_scores gs on gs.player_id = p.id
  left join public.league_career_rollups cr on cr.player_id = p.id;
$$;

create or replace function public.league_database_usage()
returns table (
  database_bytes bigint,
  league_tables_bytes bigint,
  predictions_bytes bigint,
  score_events_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pg_database_size(current_database())::bigint,
    (
      pg_total_relation_size('public.league_storage_meta') +
      pg_total_relation_size('public.league_definitions') +
      pg_total_relation_size('public.league_players') +
      pg_total_relation_size('public.league_matches') +
      pg_total_relation_size('public.league_predictions') +
      pg_total_relation_size('public.league_scoring_versions') +
      pg_total_relation_size('public.league_score_events') +
      pg_total_relation_size('public.league_career_rollups')
    )::bigint,
    pg_total_relation_size('public.league_predictions')::bigint,
    pg_total_relation_size('public.league_score_events')::bigint;
$$;

create or replace function public.league_player_participation(p_player_id uuid)
returns table (league_id text, prediction_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.league_id, count(*)::bigint
  from public.league_predictions p
  where p.player_id = p_player_id
  group by p.league_id;
$$;

create or replace function public.league_ids_for_scoring()
returns table (league_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.league_id
  from public.league_matches m
  order by m.league_id;
$$;

revoke all on function public.league_activate_scoring_version(uuid) from public, anon, authenticated;
revoke all on function public.league_save_prediction(uuid, text, text, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.league_leaderboard_rows(text, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.league_database_usage() from public, anon, authenticated;
revoke all on function public.league_player_participation(uuid) from public, anon, authenticated;
revoke all on function public.league_ids_for_scoring() from public, anon, authenticated;
grant execute on function public.league_activate_scoring_version(uuid) to service_role;
grant execute on function public.league_save_prediction(uuid, text, text, integer, integer, timestamptz) to service_role;
grant execute on function public.league_leaderboard_rows(text, timestamptz, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.league_database_usage() to service_role;
grant execute on function public.league_player_participation(uuid) to service_role;
grant execute on function public.league_ids_for_scoring() to service_role;

-- Giveaway entries v2
--
-- Campaign configuration remains in app_state.content. Participant records are
-- relational because they contain private data and may be created concurrently.

create table if not exists public.giveaway_entries (
  id uuid primary key,
  giveaway_id text not null,
  name text not null,
  email text not null,
  social_handle text not null default '',
  email_hash text not null,
  browser_hash text not null,
  rules_hash text not null,
  eligible boolean not null default true,
  winner_rank smallint,
  prize_id text not null default '',
  prize_name text not null default '',
  prize_image text not null default '',
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint giveaway_entries_name_length check (char_length(name) between 1 and 100),
  constraint giveaway_entries_email_length check (char_length(email) between 3 and 180),
  constraint giveaway_entries_social_handle_length check (char_length(social_handle) <= 180),
  constraint giveaway_entries_email_hash check (char_length(email_hash) = 64),
  constraint giveaway_entries_browser_hash check (char_length(browser_hash) = 64),
  constraint giveaway_entries_rules_hash check (char_length(rules_hash) = 64),
  constraint giveaway_entries_winner_rank check (winner_rank between 1 and 20),
  constraint giveaway_entries_draw_state check (
    (winner_rank is null and drawn_at is null)
    or (winner_rank is not null and drawn_at is not null)
  )
);

create unique index if not exists giveaway_entries_one_email
  on public.giveaway_entries (giveaway_id, email_hash);
create unique index if not exists giveaway_entries_one_browser
  on public.giveaway_entries (giveaway_id, browser_hash);
create unique index if not exists giveaway_entries_one_winner_rank
  on public.giveaway_entries (giveaway_id, winner_rank)
  where winner_rank is not null;
create index if not exists giveaway_entries_campaign_created
  on public.giveaway_entries (giveaway_id, created_at desc);
create index if not exists giveaway_entries_campaign_eligible
  on public.giveaway_entries (giveaway_id, eligible)
  where winner_rank is null;

alter table public.giveaway_entries enable row level security;
revoke all on table public.giveaway_entries from anon, authenticated;
grant select, insert, update, delete on table public.giveaway_entries to service_role;

create or replace function public.giveaway_participant_count(p_giveaway_id text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.giveaway_entries
  where giveaway_id = p_giveaway_id and eligible;
$$;

create or replace function public.giveaway_assign_winners(
  p_giveaway_id text,
  p_assignments jsonb,
  p_drawn_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_count integer;
  distinct_entry_count integer;
  distinct_rank_count integer;
  minimum_rank integer;
  maximum_rank integer;
  eligible_count integer;
  updated_count integer;
begin
  if jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'Winner assignments must be a JSON array';
  end if;

  assignment_count := jsonb_array_length(p_assignments);
  if assignment_count < 1 or assignment_count > 20 then
    raise exception 'Winner assignment count must be between 1 and 20';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_giveaway_id, 0));

  if exists (
    select 1 from public.giveaway_entries
    where giveaway_id = p_giveaway_id and winner_rank is not null
  ) then
    raise exception 'Giveaway already has winners';
  end if;

  select
    count(distinct assignment.id),
    count(distinct assignment.winner_rank),
    min(assignment.winner_rank),
    max(assignment.winner_rank)
  into distinct_entry_count, distinct_rank_count, minimum_rank, maximum_rank
  from jsonb_to_recordset(p_assignments) as assignment(
    id uuid,
    winner_rank integer,
    prize_id text,
    prize_name text,
    prize_image text
  );

  if distinct_entry_count <> assignment_count
    or distinct_rank_count <> assignment_count
    or minimum_rank <> 1
    or maximum_rank <> assignment_count
  then
    raise exception 'Winner assignments contain duplicate or invalid entries';
  end if;

  select count(*) into eligible_count
  from public.giveaway_entries entry
  join jsonb_to_recordset(p_assignments) as assignment(
    id uuid,
    winner_rank integer,
    prize_id text,
    prize_name text,
    prize_image text
  ) on assignment.id = entry.id
  where entry.giveaway_id = p_giveaway_id
    and entry.eligible
    and entry.winner_rank is null;

  if eligible_count <> assignment_count then
    raise exception 'One or more selected participants are not eligible';
  end if;

  update public.giveaway_entries entry
  set
    winner_rank = assignment.winner_rank,
    prize_id = left(coalesce(assignment.prize_id, ''), 180),
    prize_name = left(coalesce(assignment.prize_name, ''), 180),
    prize_image = left(coalesce(assignment.prize_image, ''), 1000),
    drawn_at = p_drawn_at,
    updated_at = p_drawn_at
  from jsonb_to_recordset(p_assignments) as assignment(
    id uuid,
    winner_rank integer,
    prize_id text,
    prize_name text,
    prize_image text
  )
  where entry.id = assignment.id
    and entry.giveaway_id = p_giveaway_id
    and entry.eligible
    and entry.winner_rank is null;

  get diagnostics updated_count = row_count;
  if updated_count <> assignment_count then
    raise exception 'Winner assignment was not completed';
  end if;

  return updated_count;
end;
$$;

revoke all on function public.giveaway_participant_count(text) from public, anon, authenticated;
revoke all on function public.giveaway_assign_winners(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.giveaway_participant_count(text) to service_role;
grant execute on function public.giveaway_assign_winners(text, jsonb, timestamptz) to service_role;
