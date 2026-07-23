\set ON_ERROR_STOP on

begin;

insert into public.giveaway_entries (
  id, giveaway_id, name, email, social_handle,
  email_hash, browser_hash, rules_hash, created_at, updated_at
) values
  (
    '10000000-0000-4000-8000-000000000001',
    'smoke-campaign',
    'Player One',
    'one@example.com',
    '@one',
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    '2026-07-23T10:00:00Z',
    '2026-07-23T10:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'smoke-campaign',
    'Player Two',
    'two@example.com',
    '@two',
    repeat('d', 64),
    repeat('e', 64),
    repeat('c', 64),
    '2026-07-23T10:01:00Z',
    '2026-07-23T10:01:00Z'
  );

do $$
begin
  begin
    insert into public.giveaway_entries (
      id, giveaway_id, name, email, email_hash, browser_hash, rules_hash
    ) values (
      '10000000-0000-4000-8000-000000000003',
      'smoke-campaign',
      'Duplicate Email',
      'duplicate@example.com',
      repeat('a', 64),
      repeat('f', 64),
      repeat('c', 64)
    );
    raise exception 'duplicate email hash was accepted';
  exception when unique_violation then
    null;
  end;
end;
$$;

do $$
declare
  participant_total bigint;
begin
  select public.giveaway_participant_count('smoke-campaign') into participant_total;
  if participant_total <> 2 then
    raise exception 'expected 2 eligible participants, got %', participant_total;
  end if;
end;
$$;

select public.giveaway_assign_winners(
  'smoke-campaign',
  jsonb_build_array(
    jsonb_build_object(
      'id', '10000000-0000-4000-8000-000000000001',
      'winner_rank', 1,
      'prize_id', 'ball',
      'prize_name', 'Football',
      'prize_image', '/ball.webp'
    )
  ),
  '2026-07-23T12:00:00Z'
);

do $$
declare
  winner_count integer;
begin
  select count(*) into winner_count
  from public.giveaway_entries
  where giveaway_id = 'smoke-campaign'
    and winner_rank = 1
    and prize_id = 'ball'
    and drawn_at = '2026-07-23T12:00:00Z';
  if winner_count <> 1 then
    raise exception 'atomic winner assignment did not persist';
  end if;

  begin
    perform public.giveaway_assign_winners(
      'smoke-campaign',
      jsonb_build_array(
        jsonb_build_object(
          'id', '10000000-0000-4000-8000-000000000002',
          'winner_rank', 1,
          'prize_id', 'shirt',
          'prize_name', 'Shirt',
          'prize_image', ''
        )
      ),
      '2026-07-23T12:01:00Z'
    );
    raise exception 'a second draw was accepted';
  exception when others then
    if sqlerrm = 'a second draw was accepted' then raise; end if;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform 1 from public.giveaway_entries;
    raise exception 'anon could read giveaway entries';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

rollback;
