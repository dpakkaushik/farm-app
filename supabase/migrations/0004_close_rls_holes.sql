-- Why: four tables had a permissive `true` policy sitting alongside their correct
-- farm-scoped ones. Postgres OR's permissive policies, so `true` won and the
-- correct policies did nothing. The worst let any logged-in user insert themselves
-- as admin of any farm. See supabase/PLAN_0004_rls_holes.md.

-- ── 1. Server-side invite accept ─────────────────────────────────────────────
-- Replaces client-side validation in auth.js, which enforced nothing.
create or replace function public.accept_invitation(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite   farm_invitations%rowtype;
  v_email    text;
  v_farm     jsonb;
begin
  if auth.uid() is null then
    raise exception 'Must be logged in to accept an invitation';
  end if;

  select * into v_invite
  from farm_invitations
  where token = p_token and accepted_at is null;

  if not found then
    raise exception 'Invitation not found or already used';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'This invitation has expired. Ask the farm admin to send a new one.';
  end if;

  -- If the invite named an email, the caller must actually be that person.
  select email into v_email from auth.users where id = auth.uid();
  if v_invite.email is not null
     and lower(v_invite.email) <> lower(coalesce(v_email, '')) then
    raise exception 'This invitation was sent to %. Please sign in with that email to accept.', v_invite.email;
  end if;

  insert into farm_memberships (farm_id, user_id, role, status, invited_by)
  values (v_invite.farm_id, auth.uid(), v_invite.role, 'active', v_invite.invited_by)
  on conflict do nothing;

  update farm_invitations set accepted_at = now() where id = v_invite.id;

  select to_jsonb(f) into v_farm from farms f where f.id = v_invite.farm_id;
  return v_farm;
end;
$$;

-- ── 2. farm_memberships: no more self-service admin ──────────────────────────
-- accept_invitation() and create_farm_with_membership() are SECURITY DEFINER and
-- bypass RLS, so both still work.
drop policy if exists memberships_insert on public.farm_memberships;
create policy memberships_insert on public.farm_memberships
  for insert with check (has_farm_role(farm_id, 'admin'));

-- ── 3. farm_invitations: admins only ─────────────────────────────────────────
-- get_invite_preview() is SECURITY DEFINER, so the public preview page still works.
drop policy if exists invitations_select on public.farm_invitations;
create policy invitations_select on public.farm_invitations
  for select using (has_farm_role(farm_id, 'admin'));

drop policy if exists invitations_update on public.farm_invitations;
create policy invitations_update on public.farm_invitations
  for update using (has_farm_role(farm_id, 'admin'))
  with check (has_farm_role(farm_id, 'admin'));

-- ── 4. user_profiles: drop the `true` policies ───────────────────────────────
-- handle_new_user() is SECURITY DEFINER, so auto-creation on signup still works.
drop policy if exists profiles_select_own on public.user_profiles;
drop policy if exists "authenticated can read profiles" on public.user_profiles;
drop policy if exists "authenticated can insert profiles" on public.user_profiles;
drop policy if exists "admin can update profiles" on public.user_profiles;

-- Self-insert only, as a safety net. Nobody can create a profile for anyone else.
drop policy if exists profiles_insert on public.user_profiles;
create policy profiles_insert on public.user_profiles
  for insert with check (id = auth.uid());

-- Surviving: profiles_select (id = auth.uid() OR shares_farm_with(id))
--            profiles_update (id = auth.uid())

-- ── 5. crop_residuals: drop the stray open policy ────────────────────────────
drop policy if exists farm_members_all on public.crop_residuals;
