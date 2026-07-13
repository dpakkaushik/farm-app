-- ============================================================================
-- 0001 — Auto-create user_profiles; close invite-flow RLS gaps
--
-- WHY THIS EXISTS
-- The invite flow created only two of the three rows a user needs:
--   auth.users        ✓  (magic link, shouldCreateUser: true)
--   farm_memberships  ✓  (acceptInvitation)
--   user_profiles     ✗  (nobody)
-- So an invited user could accept, set a password, and then be rejected at
-- login by auth.js: `if (!profile) throw 'Account not set up yet.'`
--
-- A client-side fix is impossible: user_profiles has no INSERT policy, so the
-- browser cannot create the row. It has to be done in the DB, once.
--
-- RUN ONCE. After this, every future signup provisions its own profile.
-- Idempotent — safe to re-run.
-- ============================================================================


-- ── 1. Auto-provision a profile for every new auth user ─────────────────────
-- SECURITY DEFINER so it bypasses RLS on user_profiles.
-- Covers ALL signup paths: invite magic-link, password signup, OAuth.
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
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    -- Vestigial. Real permissions come from farm_memberships.role, which the
    -- invite sets. App.jsx reads activeFarmRole, never profile.role.
    'manager',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── 2. Backfill users who signed up before the trigger existed ──────────────
-- Unblocks anyone currently stuck on "Account not set up yet."
insert into public.user_profiles (id, email, full_name, role, is_active)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       'manager',
       true
from auth.users u
left join public.user_profiles p on p.id = u.id
where p.id is null;


-- ── 3. Let an invitee stamp accepted_at on their own invitation ─────────────
-- farm_invitations had SELECT / INSERT / DELETE policies but no UPDATE policy.
-- acceptInvitation() does `.update({ accepted_at })`, which RLS silently
-- matched against ZERO rows — so invites were never marked used and stayed
-- replayable by anyone holding the link until expiry.
drop policy if exists "invitations_update" on public.farm_invitations;
create policy "invitations_update" on public.farm_invitations
  for update
  using (
    has_farm_role(farm_id, 'admin')
    or (
      accepted_at is null
      and expires_at > now()
      and (email is null or lower(email) = lower(auth.jwt() ->> 'email'))
    )
  );
