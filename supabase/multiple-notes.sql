alter table public.dashboard_notes add column note_items jsonb;
update public.dashboard_notes set note_items = case when enabled or content <> '' then jsonb_build_array(jsonb_build_object('id','legacy-note','content',content,'color',color,'collapsed',false)) else '[]'::jsonb end where note_items is null;
alter table public.dashboard_notes alter column note_items set default '[]'::jsonb, alter column note_items set not null;
alter table public.dashboard_notes add constraint dashboard_notes_items_bounds check (jsonb_typeof(note_items) = 'array' and jsonb_array_length(note_items) <= 50 and octet_length(note_items::text) <= 4000000);
