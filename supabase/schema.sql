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
create policy "Public read D.I.S media"
on storage.objects for select
to public
using (bucket_id = 'dis-media');

revoke all on table public.app_state from anon, authenticated;
