-- Run once in the Supabase SQL editor for this project.
-- Backs backend/api/profile_store.py (GET/PUT/DELETE /api/v1/health-profile).
--
-- Separate from any existing auth/app_metadata table: this holds sensitive
-- personal health data (conditions, routine, home/work location), which
-- should never live in a JWT-readable claim.

create table if not exists public.health_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  home_location jsonb,        -- {"name": "...", "lat": 5.6, "lon": -0.19}
  work_location jsonb,        -- same shape
  health_conditions text[] not null default '{}',
  -- e.g. asthma, heart_condition, pregnancy, elderly_household, young_children, outdoor_worker
  routine jsonb,               -- {"commute_minutes": 30, "outdoor_exercise": "morning"}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.health_profiles enable row level security;

-- the backend writes through the service-role key (bypasses RLS); this policy
-- is defense-in-depth in case a client ever queries the table directly with
-- its own session instead of going through the API.
drop policy if exists "individuals manage their own health profile" on public.health_profiles;
create policy "individuals manage their own health profile"
  on public.health_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
