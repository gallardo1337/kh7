create table public.dashboard_notes (
 user_id uuid primary key references auth.users(id) on delete cascade,
 content text not null default '' check (char_length(content) <= 20000),
 color text not null default 'yellow' check (color in ('yellow','pink','blue','green','purple')),
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.dashboard_notes enable row level security;
revoke all on public.dashboard_notes from anon, authenticated;
grant select, insert, update on public.dashboard_notes to authenticated;
create policy "Owners can read dashboard notes" on public.dashboard_notes for select to authenticated using (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
create policy "Owners can add dashboard notes" on public.dashboard_notes for insert to authenticated with check (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
create policy "Owners can update dashboard notes" on public.dashboard_notes for update to authenticated using (user_id = (select auth.uid()) and (select private.is_active_admin_session())) with check (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
