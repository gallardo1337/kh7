create table public.dashboard_value_history (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('portfolio','inventory')),
 asset_key text not null check (char_length(asset_key) between 1 and 160),
 currency text not null check (currency in ('EUR','USD')),
 day date not null default (timezone('Europe/Berlin',now())::date),
 total numeric(20,2) not null check (total >= 0 and total < 1000000000000000),
 updated_at timestamptz not null default now(),
 primary key (user_id,kind,asset_key,currency,day)
);
alter table public.dashboard_value_history enable row level security;
revoke all on public.dashboard_value_history from anon,authenticated;
grant select,insert,update on public.dashboard_value_history to authenticated;
create policy "Owners read value history" on public.dashboard_value_history for select to authenticated using (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
create policy "Owners insert value history" on public.dashboard_value_history for insert to authenticated with check (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
create policy "Owners update value history" on public.dashboard_value_history for update to authenticated using (user_id = (select auth.uid()) and (select private.is_active_admin_session())) with check (user_id = (select auth.uid()) and (select private.is_active_admin_session()));
