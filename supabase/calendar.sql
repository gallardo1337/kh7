create table public.calendar_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 is_birthday boolean not null default false,
 title text not null check (char_length(title) between 1 and 120),
 event_date date not null,
 event_time time,
 description text not null default '' check (char_length(description) <= 2000),
 deleted_at timestamptz,
 updated_at timestamptz not null default now()
);
create index calendar_events_owner_date on public.calendar_events (user_id,event_date) where deleted_at is null;
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon,authenticated;
grant select,insert,update on public.calendar_events to authenticated;
create policy "Owners read calendar" on public.calendar_events for select to authenticated using (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
create policy "Owners create calendar" on public.calendar_events for insert to authenticated with check (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
create policy "Owners update calendar" on public.calendar_events for update to authenticated using (user_id = (select auth.uid()) and (select private.is_active_admin_session())) with check (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
