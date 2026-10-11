-- Only the server may read prices or reserve API requests.
create table public.inventory_price_cache (
  market_name text primary key,
  price_usd numeric check (price_usd >= 0),
  fetched_at timestamptz not null default now()
);
create table public.inventory_api_requests (requested_at timestamptz not null default now());
create table public.inventory_refresh_limits (user_id uuid references auth.users(id) on delete cascade, steam_id text not null, requested_at timestamptz not null, primary key(user_id, steam_id));
alter table public.inventory_price_cache enable row level security;
alter table public.inventory_api_requests enable row level security;
alter table public.inventory_refresh_limits enable row level security;
revoke all on public.inventory_price_cache, public.inventory_api_requests, public.inventory_refresh_limits from anon, authenticated;
grant all on public.inventory_price_cache, public.inventory_api_requests, public.inventory_refresh_limits to service_role;
create index inventory_api_requests_time_idx on public.inventory_api_requests(requested_at);

-- Caller-scoped wrapper retains the existing live-session and admin checks.
create function public.inventory_authorized() returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_active_admin_session();
$$;
revoke all on function public.inventory_authorized() from public, anon;
grant execute on function public.inventory_authorized() to authenticated;

create function public.reserve_inventory_price_request() returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(730002);
  delete from public.inventory_api_requests where requested_at <= now() - interval '24 hours';
  if (select count(*) from public.inventory_api_requests) >= 100 or
     (select count(*) from public.inventory_api_requests where requested_at > now() - interval '1 minute') >= 25 then
    return false;
  end if;
  insert into public.inventory_api_requests default values;
  return true;
end;
$$;
revoke all on function public.reserve_inventory_price_request() from public, anon, authenticated;
grant execute on function public.reserve_inventory_price_request() to service_role;

create function public.claim_inventory_refresh(p_user_id uuid, p_steam_id text) returns boolean language plpgsql security invoker set search_path = '' as $$
declare claimed uuid;
begin
  insert into public.inventory_refresh_limits(user_id, steam_id, requested_at) values (p_user_id, p_steam_id, now())
  on conflict(user_id, steam_id) do update set requested_at = excluded.requested_at
    where inventory_refresh_limits.requested_at < now() - interval '30 seconds'
  returning user_id into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_inventory_refresh(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_inventory_refresh(uuid, text) to service_role;

create function public.inventory_cached_prices(p_names text[]) returns setof public.inventory_price_cache language sql stable security invoker set search_path = '' as $$
  select * from public.inventory_price_cache where market_name = any(p_names) and fetched_at > now() - interval '24 hours';
$$;
revoke all on function public.inventory_cached_prices(text[]) from public, anon, authenticated;
grant execute on function public.inventory_cached_prices(text[]) to service_role;
