# Plan: migration 0004 — close four live RLS holes

> **Status: NOT DONE. These holes are live in production right now.**
> Written 2026-07-13. Everything needed to execute this is in here — no
> re-investigation required.

## The bug class

Postgres OR's permissive policies together. An extra policy always makes access
**broader**, never narrower. Four tables have a correct farm-scoped policy set
sitting next to a permissive `true` policy, and the `true` one wins. The correct
policies are decorative.

All four were created by dashboard clicks, which is why nobody caught them —
see [README.md](README.md).

They are reproduced faithfully and marked `!! INSECURE` in
[`migrations/0000b_baseline_policies.sql`](migrations/0000b_baseline_policies.sql).

## The four holes

### 1. `farm_memberships` — privilege escalation (CRITICAL)

```sql
create policy memberships_insert on public.farm_memberships
  for insert with check (auth.uid() IS NOT NULL);
```

Any logged-in user can insert a membership row naming **any** `farm_id` with role
`'admin'`. `has_farm_role()` then returns true for them and they own that farm.
If signup is open, anyone who registers can take over any farm.

### 2. `user_profiles` — every profile readable by anyone

Three permissive policies defeat the correct `profiles_select`:

```sql
create policy profiles_select_own               ... for select using (true);
create policy "authenticated can read profiles" ... for select using (true);
create policy "authenticated can insert profiles" ... for insert with check (true);
```

Every name, email, mobile and photo across all farms is exposed to the anon key
(which ships in the frontend bundle). Anyone can also insert profile rows.

There is also `"admin can update profiles"`, which sub-selects `user_profiles`
from within a `user_profiles` policy. Redundant with `profiles_update` and a
recursion risk. Drop it too.

### 3. `farm_invitations` — token leak

```sql
create policy invitations_select ... using (has_farm_role(farm_id,'admin') OR (auth.uid() IS NOT NULL));
create policy invitations_update ... for update with check (auth.uid() IS NOT NULL);  -- no USING → defaults true
```

Any logged-in user can read **every** invitation row including its token, and can
update any invitation. Lift a token for someone else's farm, join it.

### 4. `crop_residuals` — wide open

```sql
create policy farm_members_all on public.crop_residuals for all using (true) with check (true);
```

Overrides its four correct policies entirely. Readable and writable by anyone.

## Why this can't just be deleted

The three loose policies on `farm_memberships` and `farm_invitations` exist to
support the invite-accept flow in `frontend/src/store/auth.js` (`acceptInvitation`,
currently lines 257-292). That function validates the token, the expiry and the
email **in JavaScript**, then inserts the membership from the browser.

Client-side validation enforces nothing — an attacker skips the JS entirely. So
the fix is to move the whole thing server-side into a `SECURITY DEFINER` function
(same shape as the existing `create_farm_with_membership`), then lock the policies.

`get_invite_preview` is already `SECURITY DEFINER`, so it bypasses RLS and the
public invite-preview page keeps working once `invitations_select` is tightened.

## Step 1 — `supabase/migrations/0004_close_rls_holes.sql`

```sql
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
create policy profiles_insert on public.user_profiles
  for insert with check (id = auth.uid());

-- Surviving: profiles_select (id = auth.uid() OR shares_farm_with(id))
--            profiles_update (id = auth.uid())

-- ── 5. crop_residuals: drop the stray open policy ────────────────────────────
drop policy if exists farm_members_all on public.crop_residuals;
```

## Step 2 — `frontend/src/store/auth.js`

Replace `acceptInvitation` (currently lines 257-292) with a single RPC call.
The validation now lives in the database; the client just reports errors.

```js
  // ── Accept invitation (public route handler) ──────────────────────────────
  // Validation lives in the accept_invitation() RPC, not here — client-side
  // checks enforce nothing. See supabase/PLAN_0004_rls_holes.md.
  acceptInvitation: async (token) => {
    const { data: farm, error } = await supabase.rpc('accept_invitation', { p_token: token })
    if (error) throw new Error(error.message)

    await get().refreshFarms()
    get().switchFarm(farm.id)
    return farm
  },
```

Note the return shape changes: the old code returned `invite.farms`; the RPC
returns the farm row directly. `switchFarm(farm.id)` replaces
`switchFarm(invite.farm_id)`.

## Step 3 — verify

After applying, confirm no permissive `true` policies survive:

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual = 'true' or with_check = 'true')
order by tablename;
```

Should return **zero rows**.

Then exercise the real flows, because these policies are load-bearing:

- [ ] Sign up a brand-new user → a `user_profiles` row is still auto-created (tests `handle_new_user`)
- [ ] Create a farm from onboarding → still works (tests `create_farm_with_membership`)
- [ ] Send an invite from Farm Settings → still works (tests `invitations_insert`)
- [ ] Open the invite link while logged out → preview still renders (tests `get_invite_preview`)
- [ ] Accept the invite as the invited user → joins the farm (tests `accept_invitation`)
- [ ] Accept an invite as the *wrong* user → rejected with the email-mismatch error

## Known fallout

**Admin → Users tab will break.** `createUser` in `store/auth.js` inserts directly
into `user_profiles`, which the new `profiles_insert` policy (`id = auth.uid()`)
forbids. That tab is already broken — [README.md](README.md) notes it creates users
belonging to no farm, and says it should be removed or rewritten to issue an
invitation. Removing it is the right move; this migration forces the issue.
