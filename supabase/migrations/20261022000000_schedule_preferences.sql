alter table public.rotation_schedules
  add column if not exists categories jsonb not null default '[]'::jsonb,
  add column if not exists assignments jsonb not null default '[]'::jsonb,
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists preferred boolean not null default false;

notify pgrst, 'reload schema';
