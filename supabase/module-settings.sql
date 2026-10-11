alter table public.dashboard_notes add column if not exists module_settings jsonb;
alter table public.dashboard_notes add constraint dashboard_module_settings_bounds check (module_settings is null or (jsonb_typeof(module_settings) = 'object' and octet_length(module_settings::text) <= 65536));
