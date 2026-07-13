-- ============================================================================
-- 0002 — Self-service user profiles
--
-- WHY THIS EXISTS
-- Invited users arrive with an email and nothing else: no name, no mobile, no
-- photo. Three problems, three fixes:
--
--   1. 0001's trigger FABRICATED a name from the email local-part, so
--      deepakkaushikdevtest@gmail.com rendered as "Hi deepakkaushikdevtest".
--      A fake name is worse than a blank one — nothing ever prompts you to fix
--      it. Stop fabricating; leave it NULL so the app can ask.
--
--   2. profiles_select is self-only (id = auth.uid()). Even after a user fills
--      in a perfect profile, an admin cannot READ it — the Members list in Farm
--      Settings renders blank rows with a "?" avatar for everyone but yourself.
--      Users who share a farm must be able to see each other.
--
--   3. No avatar_url column to store a profile picture.
--
-- Writes need no policy change: profiles_update already allows a user to update
-- their own row, which is exactly what self-service needs.
--
-- Idempotent — safe to re-run.
-- ============================================================================


-- ── 1. Columns for the profile form ─────────────────────────────────────────
alter table public.user_profiles add column if not exists phone      text;
alter table public.user_profiles add column if not exists avatar_url text;

-- full_name was NOT NULL. That constraint is unsatisfiable at signup: a user
-- invited by email has no name yet, and the DB cannot invent one. It is what
-- forced 0001 to fabricate a name from the email local-part. Drop it — the
-- app's profile gate enforces a real name at the only layer that can ASK for
-- one, and blocks entry until it has it.
alter table public.user_profiles alter column full_name drop not null;


-- ── 2. Stop inventing names from email addresses ────────────────────────────
-- Only use a real name if the signup actually supplied one. Otherwise NULL,
-- and the app's profile gate will ask the user for it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    'manager',   -- vestigial; real permissions live in farm_memberships.role
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Undo the names 0001 fabricated, so those users get prompted to enter a real
-- one. Matches only rows whose name is exactly the email local-part.
update public.user_profiles
set full_name = null
where full_name is not null
  and email is not null
  and full_name = split_part(email, '@', 1);


-- ── 3. Let people who share a farm see each other's profile ─────────────────
create or replace function public.shares_farm_with(target_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from farm_memberships me
    join farm_memberships them on them.farm_id = me.farm_id
    where me.user_id   = auth.uid()   and me.status   = 'active'
      and them.user_id = target_user  and them.status = 'active'
  )
$$;

drop policy if exists "profiles_select" on public.user_profiles;
create policy "profiles_select" on public.user_profiles
  for select
  using (id = auth.uid() or shares_farm_with(id));

-- Update stays self-only: a user edits their own profile, nobody else's.
drop policy if exists "profiles_update" on public.user_profiles;
create policy "profiles_update" on public.user_profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
