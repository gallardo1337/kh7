alter table public.calendar_events add column if not exists is_birthday boolean not null default false;
