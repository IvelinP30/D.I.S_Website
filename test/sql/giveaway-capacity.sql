\set ON_ERROR_STOP on

begin;

\timing on

insert into public.giveaway_entries (
  id,
  giveaway_id,
  name,
  email,
  social_handle,
  email_hash,
  browser_hash,
  rules_hash,
  created_at,
  updated_at
)
select
  (
    lpad(to_hex(number), 8, '0') ||
    '-0000-4000-8000-' ||
    lpad(to_hex(number), 12, '0')
  )::uuid,
  'capacity-campaign',
  'Participant ' || number,
  'participant-' || number || '@example.com',
  '@participant' || number,
  md5('email-' || number) || md5('email-extra-' || number),
  md5('browser-' || number) || md5('browser-extra-' || number),
  repeat('a', 64),
  now() + (number || ' milliseconds')::interval,
  now()
from generate_series(1, 5000) as number;

select public.giveaway_participant_count('capacity-campaign') as participant_count;

select
  pg_size_pretty(pg_total_relation_size('public.giveaway_entries')) as giveaway_table_size,
  count(*) as rows
from public.giveaway_entries
where giveaway_id = 'capacity-campaign';

rollback;
