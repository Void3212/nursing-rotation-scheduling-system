create table if not exists public.rotation_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null default 'Clinical rotation schedule',
  group_count integer not null check (group_count between 1 and 100),
  week_count integer not null check (week_count between 1 and 24),
  allow_special_repeats boolean not null default true,
  categories jsonb not null default '[]'::jsonb,
  assignments jsonb not null default '[]'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.rotation_schedules enable row level security;

create policy "Authenticated users can read rotation schedules"
  on public.rotation_schedules for select to authenticated using ((select auth.uid()) = user_id);

create policy "Authenticated users can create rotation schedules"
  on public.rotation_schedules for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Authenticated users can update rotation schedules"
  on public.rotation_schedules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Authenticated users can delete rotation schedules"
  on public.rotation_schedules for delete to authenticated using ((select auth.uid()) = user_id);