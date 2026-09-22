-- Run once in the Supabase SQL editor for this project.
-- Backs backend/api/saved_locations_store.py (GET/POST/DELETE /api/v1/saved-locations).
--
-- The PWA already has a fully working saved-locations feature
-- (frontend-pwa/src/features/savedLocations/, appState.jsx savedCities) —
-- it's local-only (localStorage), so it doesn't follow a signed-in user to a
-- new device. This table is additive sync for signed-in users; guests keep
-- today's local-only behavior unchanged.

create table if not exists public.saved_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  country text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.saved_locations enable row level security;

drop policy if exists "individuals manage their own saved locations" on public.saved_locations;
create policy "individuals manage their own saved locations"
  on public.saved_locations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
