-- KH7 Dashboard v2

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tiles (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 40),
  url text not null check (url ~ '^https?://'),
  icon_url text not null default 'images/link.svg',
  icon_alt text not null default '',
  hover_color text not null default '#444444' check (hover_color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  is_protected boolean not null default false,
  icon_scale real not null default 1 check (icon_scale between 0.5 and 2),
  icon_invert boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.tiles enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.tiles from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.admin_users to authenticated;
grant select on table public.tiles to anon, authenticated;
grant insert, update, delete on table public.tiles to authenticated;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_active_admin_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users as a
    join auth.sessions as s
      on s.user_id = a.user_id
    where a.user_id = (select auth.uid())
      and s.id = nullif((select auth.jwt() ->> 'session_id'), '')::uuid
  );
$$;

revoke all on function private.is_active_admin_session() from public;
grant execute on function private.is_active_admin_session() to authenticated;

create policy "Admins can read their membership"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Visitors can read public tiles"
on public.tiles
for select
to anon
using (is_protected = false);

create policy "Authenticated users can read allowed tiles"
on public.tiles
for select
to authenticated
using (
  is_protected = false
  or (select private.is_active_admin_session())
);

create policy "Admins can add tiles"
on public.tiles
for insert
to authenticated
with check ((select private.is_active_admin_session()));

create policy "Admins can update tiles"
on public.tiles
for update
to authenticated
using ((select private.is_active_admin_session()))
with check ((select private.is_active_admin_session()));

create policy "Admins can delete tiles"
on public.tiles
for delete
to authenticated
using ((select private.is_active_admin_session()));

insert into public.tiles (label, url, icon_url, icon_alt, hover_color, position, is_protected, icon_scale, icon_invert)
values
  ('ChatGPT', 'https://chat.openai.com', 'images/chatgpt.png', 'ChatGPT', '#10a37f', 10, false, 1, true),
  ('Instagram', 'https://instagram.com', 'https://cdn.simpleicons.org/instagram/FFFFFF', 'Instagram', '#df4996', 20, false, 1, false),
  ('Twitter', 'https://twitter.com', 'https://cdn.simpleicons.org/x/FFFFFF', 'Twitter', '#1da1f2', 30, false, 1, false),
  ('YouTube', 'https://youtube.com', 'https://cdn.simpleicons.org/youtube/FFFFFF', 'YouTube', '#ff0000', 40, false, 1, false),
  ('Twitch', 'https://www.twitch.tv', 'https://cdn.simpleicons.org/twitch/FFFFFF', 'Twitch', '#9146ff', 50, false, 1, false),
  ('Cardmarket', 'https://www.cardmarket.com', 'https://cdn.simpleicons.org/cardmarket/FFFFFF', 'Cardmarket', '#003366', 60, false, 1, false),
  ('Kicker', 'https://www.kicker.de', 'images/kicker_k_white.png', 'Kicker', '#d60018', 70, false, 1.3, false),
  ('Kicktipp', 'https://www.kicktipp.de', 'images/kt.png', 'Kicktipp', '#e50019', 80, false, 0.95, false),
  ('Bild', 'https://www.bild.de', 'images/bild_white.png', 'Bild', '#ed1c24', 90, false, 1, false),
  ('Transfermarkt', 'https://www.transfermarkt.de', 'images/tm.png', 'Transfermarkt', '#05396d', 100, false, 0.95, false),
  ('Amazon', 'https://amazon.de', 'https://img.icons8.com/ios-filled/50/ffffff/amazon.png', 'Amazon', '#ff9900', 110, false, 1, false),
  ('Facebook', 'https://facebook.com', 'https://cdn.simpleicons.org/facebook/FFFFFF', 'Facebook', '#1877f3', 120, false, 1, false),
  ('mydealz', 'https://www.mydealz.de', 'images/mydealz_two_tone.png', 'Mydealz', '#4dc431', 130, false, 1.2, false),
  ('NAS', 'http://QuickConnect.to/ikanoNAS', 'https://img.icons8.com/ios-filled/50/ffffff/server.png', 'NAS', '#0051ff', 140, false, 1, false),
  ('Reddit', 'https://www.reddit.com', 'https://cdn.simpleicons.org/reddit/FFFFFF', 'Reddit', '#ff4500', 150, false, 1, false),
  ('Onlyfans', 'https://www.onlyfans.com', 'https://cdn.simpleicons.org/onlyfans/FFFFFF', 'Onlyfans', '#00aff0', 160, true, 1, false),
  ('Planetsuzy', 'https://www.planetsuzy.org', 'images/xxx.png', '18+', '#e60dc9', 170, true, 1, true),
  ('pornBB', 'https://www.pornbb.org', 'images/xxx.png', '18+', '#ab47bc', 180, true, 1, true),
  ('F95Zone', 'https://www.f95zone.to', 'images/f95.png', 'F95Zone', '#ae3537', 190, true, 0.95, false);
