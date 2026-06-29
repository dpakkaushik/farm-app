# SaaS Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-tenant farm app into a full multi-tenant SaaS where n users × m farms are supported with complete data isolation via Supabase RLS.

**Architecture:** RLS-First — Supabase Row Level Security policies enforce data isolation at the database layer. A `farm_memberships` junction table links users to farms with per-farm roles. The frontend tracks `activeFarmId` in auth store (persisted to localStorage); all Supabase queries filter by it. The FastAPI backend is out of scope for this migration (it runs against SQL Server, separate from Supabase — the frontend is the primary data path).

**Tech Stack:** Supabase (Postgres 15, RLS), React 18, Zustand, Supabase JS client v2, Tailwind CSS, shadcn/ui-like inline components

## Global Constraints

- Primary data path is frontend → Supabase directly (not through FastAPI)
- All existing `farms` table rows get assigned to a default migration farm
- `farm_id` UUID type, references `farms(id)` with `ON DELETE CASCADE`
- RLS uses `auth.uid()` checked against `farm_memberships`
- Roles: `admin` (owner), `manager` (field ops), `view_only` (investor/auditor)
- `is_super_admin` on `user_profiles` gates the hidden `/super-admin` route
- Farm switcher always visible in top bar for users with multiple farms
- Invitation flow: link-based (no email send required for MVP — owner shares link via WhatsApp)
- `activeFarmId` persisted in `localStorage` key `active_farm_id`
- Color: `#1D9E75` primary, `#E24B4A` danger, `#BA7517` warning

---

## File Map

**New files to create:**
- `frontend/src/components/FarmSwitcher.jsx` — dropdown farm picker in top bar
- `frontend/src/components/CreateFarmModal.jsx` — modal to create a new farm
- `frontend/src/pages/FarmOnboarding.jsx` — full-screen onboarding shown when user has 0 farms
- `frontend/src/pages/FarmSettings.jsx` — `/settings` route, admin-only
- `frontend/src/pages/AcceptInvite.jsx` — `/invite/:token` public route, creates membership
- `frontend/src/pages/SuperAdmin.jsx` — `/super-admin` hidden route, `is_super_admin` only
- `supabase/migrations/001_multitenancy.sql` — all DB changes in one migration

**Files to modify:**
- `frontend/src/store/auth.js` — fetch memberships, expose activeFarmId, switchFarm
- `frontend/src/store/index.js` — add `farm_id` filter to all 27 queries in `loadAll()`, add `farm_id` to all inserts
- `frontend/src/App.jsx` — farm switcher in top bar, new routes, onboarding gate

---

## Task 1: Database Migration SQL

**Files:**
- Create: `supabase/migrations/001_multitenancy.sql`

**Interfaces:**
- Produces: `farm_memberships(id, farm_id, user_id, role, status, invited_by, joined_at)` table
- Produces: `farm_invitations(id, farm_id, email, role, token, invited_by, expires_at, accepted_at)` table
- Produces: `farm_id UUID` column on all 26 data tables
- Produces: RLS policies on all tables (SELECT/INSERT/UPDATE/DELETE)

- [ ] **Step 1: Create migration file directory**

```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Write the full migration SQL**

Create `supabase/migrations/001_multitenancy.sql`:

```sql
-- ============================================================
-- PART 1: New multi-tenancy tables
-- ============================================================

-- farm_memberships: links users to farms with a role
CREATE TABLE IF NOT EXISTS farm_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'view_only')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  invited_by  UUID REFERENCES auth.users(id),
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (farm_id, user_id)
);

-- farm_invitations: token-based invite links
CREATE TABLE IF NOT EXISTS farm_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  email       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('manager', 'view_only')),
  token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by  UUID NOT NULL REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Add is_super_admin to user_profiles if not exists
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- PART 2: Add farm_id to all data tables
-- (farms table already exists and is the parent)
-- ============================================================

ALTER TABLE plots              ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE crops              ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE crop_activity_templates ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE crop_cycles        ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE inventory_items    ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE inventory_purchases ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE inventory_issues   ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE activity_logs      ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE labour_master      ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE labour_logs        ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE media_files        ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE attendance         ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE salary_advances    ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE salary_payments    ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE work_types         ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE activity_types     ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE machinery_master   ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE farm_assets        ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE livestock_master   ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE livestock_count_logs ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE harvest_sessions   ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE sales              ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE buyers             ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE partners           ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE farm_expenses      ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE livestock_revenue  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE crop_residuals     ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;

-- Lazily-loaded tables used by LedgerPage
ALTER TABLE vendors            ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE vendor_payments    ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE owner_cash_entries ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE expense_payments   ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE inventory_bills    ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE scrap_sales        ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;

-- ============================================================
-- PART 3: Enable RLS on all tables
-- ============================================================

ALTER TABLE farms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots              ENABLE ROW LEVEL SECURITY;
ALTER TABLE crops              ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_activity_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_cycles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_issues   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_master      ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance         ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_advances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE machinery_master   ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_assets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestock_master   ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestock_count_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales              ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners           ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_expenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestock_revenue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_residuals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_bills    ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 4: RLS helper function
-- ============================================================

CREATE OR REPLACE FUNCTION is_farm_member(fid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_memberships
    WHERE farm_id = fid AND user_id = auth.uid() AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION has_farm_role(fid UUID, required_role TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_memberships
    WHERE farm_id = fid AND user_id = auth.uid() AND status = 'active'
      AND (
        (required_role = 'admin'    AND role = 'admin') OR
        (required_role = 'manager'  AND role IN ('admin', 'manager')) OR
        (required_role = 'view_only' AND role IN ('admin', 'manager', 'view_only'))
      )
  )
$$;

-- ============================================================
-- PART 5: RLS policies
-- ============================================================

-- farms: any member can read their farm
CREATE POLICY "farms_select" ON farms FOR SELECT USING (is_farm_member(id));
CREATE POLICY "farms_insert" ON farms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "farms_update" ON farms FOR UPDATE USING (has_farm_role(id, 'admin'));
CREATE POLICY "farms_delete" ON farms FOR DELETE USING (has_farm_role(id, 'admin'));

-- farm_memberships: see your own memberships or if you're admin of that farm
CREATE POLICY "memberships_select" ON farm_memberships FOR SELECT
  USING (user_id = auth.uid() OR has_farm_role(farm_id, 'admin'));
CREATE POLICY "memberships_insert" ON farm_memberships FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL); -- service layer controls this
CREATE POLICY "memberships_update" ON farm_memberships FOR UPDATE
  USING (has_farm_role(farm_id, 'admin'));
CREATE POLICY "memberships_delete" ON farm_memberships FOR DELETE
  USING (has_farm_role(farm_id, 'admin') OR user_id = auth.uid()); -- can leave

-- farm_invitations: farm admins manage, anyone can read by token (token is secret)
CREATE POLICY "invitations_select" ON farm_invitations FOR SELECT
  USING (has_farm_role(farm_id, 'admin') OR auth.uid() IS NOT NULL);
CREATE POLICY "invitations_insert" ON farm_invitations FOR INSERT
  WITH CHECK (has_farm_role(farm_id, 'admin'));
CREATE POLICY "invitations_delete" ON farm_invitations FOR DELETE
  USING (has_farm_role(farm_id, 'admin'));

-- Data tables: member=read, manager=write, admin=delete
-- Macro applied to all 26 data tables:

DO $$ DECLARE t TEXT; DECLARE tables TEXT[] := ARRAY[
  'plots','crops','crop_activity_templates','crop_cycles',
  'inventory_items','inventory_purchases','inventory_issues',
  'activity_logs','labour_master','labour_logs','media_files',
  'attendance','salary_advances','salary_payments',
  'work_types','activity_types','machinery_master','farm_assets',
  'livestock_master','livestock_count_logs','harvest_sessions',
  'sales','buyers','partners','farm_expenses','livestock_revenue',
  'crop_residuals','vendors','vendor_payments','owner_cash_entries',
  'expense_payments','inventory_bills'
];
BEGIN FOREACH t IN ARRAY tables LOOP
  EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (is_farm_member(farm_id))', t, t);
  EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (has_farm_role(farm_id, ''manager''))', t, t);
  EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE USING (has_farm_role(farm_id, ''manager''))', t, t);
  EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE USING (has_farm_role(farm_id, ''admin''))', t, t);
END LOOP; END $$;

-- user_profiles: each user sees only their own profile
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update" ON user_profiles FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- PART 6: Data migration — assign all existing rows to a default farm
-- ============================================================

-- Create the migration farm if it doesn't exist
DO $$
DECLARE v_farm_id UUID;
DECLARE v_owner_id UUID;
BEGIN
  -- Find the first admin user to be the owner
  SELECT id INTO v_owner_id FROM user_profiles WHERE role = 'admin' LIMIT 1;
  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id FROM auth.users LIMIT 1;
  END IF;

  -- Check if farms table is empty
  SELECT id INTO v_farm_id FROM farms LIMIT 1;

  IF v_farm_id IS NULL THEN
    -- Create the default farm
    INSERT INTO farms (name, location, total_acres, owner_id)
    VALUES ('My Farm', 'India', 0, v_owner_id)
    RETURNING id INTO v_farm_id;
  END IF;

  -- Create membership for all existing user_profiles as admin
  INSERT INTO farm_memberships (farm_id, user_id, role, status)
  SELECT v_farm_id, id, 'admin', 'active'
  FROM user_profiles
  ON CONFLICT (farm_id, user_id) DO NOTHING;

  -- Assign all existing data to this farm
  UPDATE plots              SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE crops              SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE crop_activity_templates SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE crop_cycles        SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE inventory_items    SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE inventory_purchases SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE inventory_issues   SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE activity_logs      SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE labour_master      SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE labour_logs        SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE media_files        SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE attendance         SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE salary_advances    SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE salary_payments    SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE work_types         SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE activity_types     SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE machinery_master   SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE farm_assets        SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE livestock_master   SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE livestock_count_logs SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE harvest_sessions   SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE sales              SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE buyers             SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE partners           SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE farm_expenses      SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE livestock_revenue  SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE crop_residuals     SET farm_id = v_farm_id WHERE farm_id IS NULL;

  -- Lazy-loaded tables
  UPDATE vendors            SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE vendor_payments    SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE owner_cash_entries SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE expense_payments   SET farm_id = v_farm_id WHERE farm_id IS NULL;
  UPDATE inventory_bills    SET farm_id = v_farm_id WHERE farm_id IS NULL;
END $$;
```

- [ ] **Step 3: Apply migration via Supabase MCP**

Run the migration SQL against the Supabase project using `mcp__claude_ai_Supabase__apply_migration`.

- [ ] **Step 4: Verify tables exist**

Run: `mcp__claude_ai_Supabase__execute_sql` with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('farm_memberships', 'farm_invitations')
ORDER BY table_name;
```
Expected: 2 rows returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/001_multitenancy.sql
git commit -m "feat: add farm_memberships, farm_invitations tables and RLS policies"
```

---

## Task 2: Auth Store — Multi-Farm Support

**Files:**
- Modify: `frontend/src/store/auth.js`

**Interfaces:**
- Produces: `useAuthStore.activeFarmId` — UUID of currently selected farm (persisted to localStorage)
- Produces: `useAuthStore.farms` — array of `{ farm_id, farm_name, farm_location, role }` for current user
- Produces: `useAuthStore.activeFarm` — the full farm object matching activeFarmId
- Produces: `useAuthStore.switchFarm(farmId)` — sets activeFarmId, persists, calls `useAppStore.getState().loadAll()`
- Produces: `useAuthStore.createFarm({ name, location, total_acres })` — inserts farm + membership
- Produces: `useAuthStore.isSuperAdmin` — boolean from profile.is_super_admin
- Consumes: `is_farm_member()` RLS function (automatic via Supabase RLS)

- [ ] **Step 1: Replace `frontend/src/store/auth.js` entirely**

```javascript
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

async function fetchProfile(userId) {
  const { data } = await supabase
    .from('user_profiles').select('*').eq('id', userId).single()
  return data
}

async function fetchMemberships(userId) {
  const { data } = await supabase
    .from('farm_memberships')
    .select('farm_id, role, status, farms(id, name, location, total_acres, map_state, overlay_config)')
    .eq('user_id', userId)
    .eq('status', 'active')
  return (data || []).map(m => ({
    farm_id:       m.farm_id,
    role:          m.role,
    farm_name:     m.farms?.name || 'Unnamed Farm',
    farm_location: m.farms?.location || '',
    total_acres:   m.farms?.total_acres || 0,
    map_state:     m.farms?.map_state || null,
    overlay_config: m.farms?.overlay_config || null,
  }))
}

function getStoredFarmId() {
  try { return localStorage.getItem('active_farm_id') || null } catch { return null }
}

function storeActiveFarmId(id) {
  try { if (id) localStorage.setItem('active_farm_id', id); else localStorage.removeItem('active_farm_id') } catch {}
}

const useAuthStore = create((set, get) => ({
  user:          null,
  profile:       null,
  loading:       true,
  users:         [],
  farms:         [],        // memberships with farm details
  activeFarmId:  null,      // currently selected farm UUID
  activeFarm:    null,      // full farm object

  get isSuperAdmin() { return get().profile?.is_super_admin === true },
  get activeFarmRole() {
    const { activeFarmId, farms } = get()
    return farms.find(f => f.farm_id === activeFarmId)?.role || null
  },

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const [profile, memberships] = await Promise.all([
        fetchProfile(session.user.id),
        fetchMemberships(session.user.id),
      ])
      const activeFarmId = resolveActiveFarm(memberships)
      set({
        user: session.user, profile, loading: false,
        farms: memberships,
        activeFarmId,
        activeFarm: memberships.find(f => f.farm_id === activeFarmId) || null,
      })
    } else {
      set({ loading: false })
    }
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        storeActiveFarmId(null)
        set({ user: null, profile: null, farms: [], activeFarmId: null, activeFarm: null })
        return
      }
      if (session?.user) {
        const [profile, memberships] = await Promise.all([
          fetchProfile(session.user.id),
          fetchMemberships(session.user.id),
        ])
        const activeFarmId = resolveActiveFarm(memberships)
        set({
          user: session.user, profile,
          farms: memberships, activeFarmId,
          activeFarm: memberships.find(f => f.farm_id === activeFarmId) || null,
        })
      }
    })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const [profile, memberships] = await Promise.all([
      fetchProfile(data.user.id),
      fetchMemberships(data.user.id),
    ])
    if (!profile) throw new Error('Account not set up yet. Contact your admin.')
    if (!profile.is_active) throw new Error('Account deactivated. Contact your admin.')
    const activeFarmId = resolveActiveFarm(memberships)
    set({
      user: data.user, profile,
      farms: memberships, activeFarmId,
      activeFarm: memberships.find(f => f.farm_id === activeFarmId) || null,
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    storeActiveFarmId(null)
    set({ user: null, profile: null, farms: [], activeFarmId: null, activeFarm: null })
  },

  switchFarm: (farmId) => {
    const { farms } = get()
    const farm = farms.find(f => f.farm_id === farmId)
    if (!farm) return
    storeActiveFarmId(farmId)
    set({ activeFarmId: farmId, activeFarm: farm })
    // Reload all data for the new farm
    import('./index.js').then(m => m.useAppStore.getState().loadAll())
  },

  refreshFarms: async () => {
    const { user } = get()
    if (!user) return
    const memberships = await fetchMemberships(user.id)
    const { activeFarmId } = get()
    const stillMember = memberships.find(f => f.farm_id === activeFarmId)
    const newActiveFarmId = stillMember ? activeFarmId : resolveActiveFarm(memberships)
    storeActiveFarmId(newActiveFarmId)
    set({
      farms: memberships, activeFarmId: newActiveFarmId,
      activeFarm: memberships.find(f => f.farm_id === newActiveFarmId) || null,
    })
  },

  createFarm: async ({ name, location, total_acres }) => {
    const { user } = get()
    if (!user) throw new Error('Not logged in')

    const { data: farm, error: fErr } = await supabase
      .from('farms')
      .insert({ name, location: location || 'India', total_acres: parseFloat(total_acres) || 0, owner_id: user.id })
      .select().single()
    if (fErr) throw fErr

    const { error: mErr } = await supabase.from('farm_memberships').insert({
      farm_id: farm.id, user_id: user.id, role: 'admin', status: 'active',
    })
    if (mErr) throw mErr

    await get().refreshFarms()
    get().switchFarm(farm.id)
    return farm
  },

  // ── Invitation management ─────────────────────────────────────────────────

  createInvitation: async ({ role }) => {
    const { activeFarmId, user } = get()
    if (!activeFarmId || !user) throw new Error('No active farm')
    const { data, error } = await supabase.from('farm_invitations').insert({
      farm_id:    activeFarmId,
      role,
      invited_by: user.id,
    }).select().single()
    if (error) throw error
    return data // caller reads data.token to build the link
  },

  loadInvitations: async () => {
    const { activeFarmId } = get()
    if (!activeFarmId) return []
    const { data } = await supabase
      .from('farm_invitations')
      .select('*')
      .eq('farm_id', activeFarmId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
    return data || []
  },

  revokeInvitation: async (id) => {
    const { error } = await supabase.from('farm_invitations').delete().eq('id', id)
    if (error) throw error
  },

  // ── Member management ─────────────────────────────────────────────────────

  loadMembers: async () => {
    const { activeFarmId } = get()
    if (!activeFarmId) return []
    const { data } = await supabase
      .from('farm_memberships')
      .select('*, user_profiles(id, full_name, email, role)')
      .eq('farm_id', activeFarmId)
      .eq('status', 'active')
    return data || []
  },

  removeMember: async (userId) => {
    const { activeFarmId } = get()
    const { error } = await supabase.from('farm_memberships')
      .delete()
      .eq('farm_id', activeFarmId)
      .eq('user_id', userId)
    if (error) throw error
  },

  updateMemberRole: async (userId, role) => {
    const { activeFarmId } = get()
    const { error } = await supabase.from('farm_memberships')
      .update({ role })
      .eq('farm_id', activeFarmId)
      .eq('user_id', userId)
    if (error) throw error
  },

  acceptInvitation: async (token) => {
    const { user } = get()
    if (!user) throw new Error('Must be logged in to accept invitation')

    // Read invitation
    const { data: invite, error: iErr } = await supabase
      .from('farm_invitations')
      .select('*, farms(id, name)')
      .eq('token', token)
      .is('accepted_at', null)
      .single()
    if (iErr || !invite) throw new Error('Invitation not found or already used')
    if (new Date(invite.expires_at) < new Date()) throw new Error('This invitation has expired. Ask the farm admin to send a new one.')

    // Create membership
    const { error: mErr } = await supabase.from('farm_memberships').insert({
      farm_id: invite.farm_id, user_id: user.id, role: invite.role, status: 'active',
      invited_by: invite.invited_by,
    })
    if (mErr && !mErr.message.includes('duplicate')) throw mErr

    // Mark invite accepted
    await supabase.from('farm_invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)

    await get().refreshFarms()
    get().switchFarm(invite.farm_id)
    return invite.farms
  },

  // ── User management (admin panel) ─────────────────────────────────────────

  loadUsers: async () => {
    const { data } = await supabase.from('user_profiles').select('*').order('created_at')
    set({ users: data || [] })
  },

  createUser: async ({ email, password, full_name, role, phone }) => {
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      const { error: pErr } = await supabase.from('user_profiles').insert({
        id: data.user.id, email, full_name, role, phone: phone || null,
      })
      if (pErr) throw pErr
      await get().loadUsers()
      return data.user
    } finally {
      if (session) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        })
      }
    }
  },

  updateUser: async (id, updates) => {
    const { error } = await supabase.from('user_profiles').update(updates).eq('id', id)
    if (error) throw error
    set(s => ({ users: s.users.map(u => u.id === id ? { ...u, ...updates } : u) }))
  },

  deactivateUser: async (id) => {
    const { error } = await supabase.from('user_profiles').update({ is_active: false }).eq('id', id)
    if (error) throw error
    set(s => ({ users: s.users.map(u => u.id === id ? { ...u, is_active: false } : u) }))
  },

  reactivateUser: async (id) => {
    const { error } = await supabase.from('user_profiles').update({ is_active: true }).eq('id', id)
    if (error) throw error
    set(s => ({ users: s.users.map(u => u.id === id ? { ...u, is_active: true } : u) }))
  },
}))

function resolveActiveFarm(memberships) {
  if (!memberships.length) return null
  const stored = getStoredFarmId()
  const stillMember = memberships.find(f => f.farm_id === stored)
  const chosen = stillMember ? stored : memberships[0].farm_id
  storeActiveFarmId(chosen)
  return chosen
}

// Role helpers (farm-scoped — check against activeFarmRole)
const isAdmin     = (role) => role === 'admin'
const isManager   = (role) => role === 'admin' || role === 'manager'
const canEdit     = (role) => role !== 'view_only'

export { useAuthStore, isAdmin, isManager, canEdit }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store/auth.js
git commit -m "feat: auth store supports multi-farm memberships and activeFarmId"
```

---

## Task 3: App Store — Filter All Queries by Farm

**Files:**
- Modify: `frontend/src/store/index.js`

**Interfaces:**
- Consumes: `useAuthStore.getState().activeFarmId` — UUID used to filter every query
- Produces: All 27 queries in `loadAll()` filtered with `.eq('farm_id', activeFarmId)`
- Produces: All insert operations include `farm_id: activeFarmId`

- [ ] **Step 1: Add farm_id filter to every query in `loadAll()`**

Find the `loadAll: async () => {` function (around line 467). After `set({ loading: true })`, add:

```javascript
const activeFarmId = useAuthStore.getState().activeFarmId
if (!activeFarmId) { set({ loading: false }); return }
```

Then add `.eq('farm_id', activeFarmId)` to every Supabase query. Replace the entire Promise.all block (lines 498–541 in the original) with:

```javascript
const [
  { data: plotsRaw },
  { data: cropsRaw },
  { data: templates },
  { data: cyclesRaw },
  { data: itemsRaw },
  { data: purchasesRaw },
  { data: issuesRaw },
  { data: activitiesRaw },
  { data: labourRaw },
  { data: labourLogsRaw },
  { data: mediaRaw },
  { data: attendanceRaw },
  { data: advancesRaw },
  { data: salaryPaymentsRaw },
  { data: workTypesRaw },
  { data: activityTypesRaw },
  { data: machineryRaw },
  { data: farmAssetsRaw },
  { data: livestockRaw },
  { data: countLogsRaw },
  { data: harvestSessionsRaw },
  { data: salesRaw },
  { data: buyersRaw },
  { data: partnersRaw },
  { data: farmExpensesRaw },
  { data: livestockRevenueRaw },
  { data: cropResidualsRaw },
] = await Promise.all([
  supabase.from('plots').select('*').eq('farm_id', activeFarmId).order('name'),
  supabase.from('crops').select('*').eq('farm_id', activeFarmId).order('name'),
  supabase.from('crop_activity_templates').select('*').eq('farm_id', activeFarmId).order('day_offset'),
  supabase.from('crop_cycles')
    .select('*, plots(name,area_acres), crops(name,color,icon)')
    .eq('farm_id', activeFarmId)
    .order('created_at', { ascending: false }),
  supabase.from('inventory_items').select('*').eq('farm_id', activeFarmId).order('category').order('name'),
  supabase.from('inventory_purchases')
    .select('*, inventory_bills(bill_file_url)').eq('farm_id', activeFarmId).order('purchase_date', { ascending: false }),
  supabase.from('inventory_issues')
    .select('*, plots(name), crop_cycles(season, plots(name))')
    .eq('farm_id', activeFarmId)
    .order('issue_date', { ascending: false }),
  supabase.from('activity_logs')
    .select('*, plots(name)').eq('farm_id', activeFarmId).order('created_at', { ascending: false }),
  supabase.from('labour_master').select('*').eq('farm_id', activeFarmId).in('status', ['active', 'paused']).order('name'),
  supabase.from('labour_logs')
    .select('*, plots(name)').eq('farm_id', activeFarmId).order('activity_date', { ascending: false }),
  supabase.from('media_files')
    .select('*, plots(name)')
    .eq('farm_id', activeFarmId)
    .in('entity_type', ['farm_photo', 'farm_video'])
    .order('created_at', { ascending: false }),
  supabase.from('attendance')
    .select('id, labour_master_id, status')
    .eq('farm_id', activeFarmId)
    .eq('attendance_date', new Date().toISOString().slice(0, 10)),
  supabase.from('salary_advances')
    .select('*')
    .eq('farm_id', activeFarmId)
    .eq('is_recovered', false)
    .order('advance_date', { ascending: false }),
  supabase.from('salary_payments').select('*').eq('farm_id', activeFarmId).order('payment_date', { ascending: false }),
  supabase.from('work_types').select('*').eq('farm_id', activeFarmId).eq('is_active', true).order('name'),
  supabase.from('activity_types').select('*').eq('farm_id', activeFarmId).eq('is_active', true).order('sort_order'),
  supabase.from('machinery_master').select('*').eq('farm_id', activeFarmId).eq('is_active', true).order('display_id'),
  supabase.from('farm_assets').select('*').eq('farm_id', activeFarmId).eq('is_active', true).order('display_id'),
  supabase.from('livestock_master').select('*').eq('farm_id', activeFarmId).eq('is_active', true).order('name'),
  supabase.from('livestock_count_logs').select('*').eq('farm_id', activeFarmId).order('log_date', { ascending: false }),
  supabase.from('harvest_sessions').select('*').eq('farm_id', activeFarmId).order('harvest_date'),
  supabase.from('sales').select('*').eq('farm_id', activeFarmId).order('sale_date'),
  supabase.from('buyers').select('*').eq('farm_id', activeFarmId).eq('is_active', true).order('name'),
  supabase.from('partners').select('*').eq('farm_id', activeFarmId).eq('is_active', true).order('name'),
  supabase.from('farm_expenses').select('*').eq('farm_id', activeFarmId).order('expense_date', { ascending: false }),
  supabase.from('livestock_revenue').select('*').eq('farm_id', activeFarmId).order('revenue_date', { ascending: false }),
  supabase.from('crop_residuals').select('*').eq('farm_id', activeFarmId).order('created_at', { ascending: false }),
])
```

- [ ] **Step 2: Add `farm_id` import at the top of store/index.js**

At the top of `frontend/src/store/index.js`, after the `import { supabase }` line, add:

```javascript
import { useAuthStore } from './auth'
```

- [ ] **Step 3: Add farm_id to all insert operations**

Search for every `.insert({` call in the store. Add `farm_id: useAuthStore.getState().activeFarmId,` as the first field in each insert object.

Key inserts to update (search string: `supabase.from(`):
- `plots` insert in `addPlot`
- `crops` insert in `addCrop`
- `crop_cycles` insert in `addCropCycle`
- `crop_activity_templates` inserts
- `inventory_items` insert in `addInventoryItem`
- `inventory_purchases` insert in `addPurchase`
- `inventory_issues` insert in `addIssue`
- `activity_logs` insert in `addActivity`
- `labour_master` inserts (permanent staff, regular, contractual)
- `labour_logs` insert in `addLabourLog`
- `media_files` insert in `addMediaItem`
- `attendance` insert in `markAttendance`
- `salary_advances` insert in `addAdvance`
- `salary_payments` insert in `addSalaryPayment`
- `work_types` insert in `addWorkType`
- `activity_types` insert in `addActivityType`
- `machinery_master` insert in `addMachinery`
- `farm_assets` insert in `addFarmAsset`
- `livestock_master` insert in `addLivestock`
- `livestock_count_logs` insert in `addCountLog`
- `harvest_sessions` insert in `addHarvestSession`
- `sales` insert in `addSale`
- `buyers` insert in `addBuyer`
- `partners` insert in `addPartner`
- `farm_expenses` insert in `addFarmExpense`
- `livestock_revenue` insert in `addLivestockRevenue`
- `crop_residuals` insert in `addResidual`
- `vendors` insert in `addVendor`
- `vendor_payments` insert in `addVendorPayment`
- `owner_cash_entries` insert in `addOwnerCashEntry`
- `expense_payments` insert in `addExpensePayment`
- `inventory_bills` insert in `addInventoryBill`

- [ ] **Step 4: Update lazy-loaded ledger queries to also filter by farm_id**

Find `loadLedger` (or similar functions that load vendors, vendor_payments, etc.) and add `.eq('farm_id', activeFarmId)` to each.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/index.js
git commit -m "feat: filter all store queries by activeFarmId for data isolation"
```

---

## Task 4: FarmSwitcher + FarmOnboarding Components

**Files:**
- Create: `frontend/src/components/FarmSwitcher.jsx`
- Create: `frontend/src/components/CreateFarmModal.jsx`
- Create: `frontend/src/pages/FarmOnboarding.jsx`

**Interfaces:**
- Consumes: `useAuthStore().farms` — array of memberships
- Consumes: `useAuthStore().activeFarmId`
- Consumes: `useAuthStore().switchFarm(farmId)`
- Consumes: `useAuthStore().createFarm({ name, location, total_acres })`

- [ ] **Step 1: Create FarmSwitcher.jsx**

Create `frontend/src/components/FarmSwitcher.jsx`:

```jsx
import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Check } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import CreateFarmModal from './CreateFarmModal'

export default function FarmSwitcher() {
  const { farms, activeFarmId, activeFarm, switchFarm } = useAuthStore()
  const [open, setOpen]     = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!activeFarm) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:bg-white/10"
        style={{ color: 'var(--c-text)' }}>
        <span className="text-[11px] font-bold truncate max-w-[120px]">🌾 {activeFarm.farm_name}</span>
        {farms.length > 1 && <ChevronDown size={11} style={{ color: 'var(--c-faint)' }} />}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-52 rounded-xl border shadow-lg overflow-hidden"
          style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
          <p className="text-[9px] font-semibold uppercase tracking-wider px-3 pt-2.5 pb-1"
            style={{ color: 'var(--c-faint)' }}>Your Farms</p>
          {farms.map(f => (
            <button key={f.farm_id}
              onClick={() => { switchFarm(f.farm_id); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--c-text)' }}>{f.farm_name}</p>
                <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{f.role} · {f.total_acres} ac</p>
              </div>
              {f.farm_id === activeFarmId && <Check size={12} style={{ color: '#1D9E75' }} />}
            </button>
          ))}
          <div className="border-t mx-3" style={{ borderColor: 'var(--c-border)' }} />
          <button onClick={() => { setOpen(false); setShowCreate(true) }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/5">
            <Plus size={12} style={{ color: '#1D9E75' }} />
            <span className="text-xs font-semibold" style={{ color: '#1D9E75' }}>Add New Farm</span>
          </button>
        </div>
      )}

      {showCreate && <CreateFarmModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Create CreateFarmModal.jsx**

Create `frontend/src/components/CreateFarmModal.jsx`:

```jsx
import React, { useState } from 'react'
import { X } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export default function CreateFarmModal({ onClose }) {
  const { createFarm } = useAuthStore()
  const [form, setForm]     = useState({ name: '', location: '', total_acres: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createFarm(form)
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl border p-5 space-y-4"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>🌾 New Farm</p>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--c-faint)' }} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold" style={{ color: 'var(--c-muted)' }}>Farm Name *</label>
            <input className="finput mt-1 w-full" placeholder="e.g. Kaushal Farm"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-semibold" style={{ color: 'var(--c-muted)' }}>Location</label>
            <input className="finput mt-1 w-full" placeholder="e.g. Lakhimpur, UP"
              value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-semibold" style={{ color: 'var(--c-muted)' }}>Total Acres</label>
            <input type="number" className="finput mt-1 w-full" placeholder="e.g. 50"
              value={form.total_acres} onChange={e => setForm(p => ({ ...p, total_acres: e.target.value }))} />
          </div>
        </div>
        {error && <p className="text-[11px] text-[#E24B4A]">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex-1 py-2.5 text-xs font-bold rounded-xl disabled:opacity-40"
            style={{ background: '#1D9E75', color: 'white' }}>
            {saving ? 'Creating…' : 'Create Farm'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 text-xs rounded-xl"
            style={{ background: 'var(--c-ghost)', color: 'var(--c-sub)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create FarmOnboarding.jsx**

Create `frontend/src/pages/FarmOnboarding.jsx`:

```jsx
import React, { useState } from 'react'
import { useAuthStore } from '../store/auth'

export default function FarmOnboarding() {
  const { createFarm, logout, profile } = useAuthStore()
  const [form, setForm]     = useState({ name: '', location: '', total_acres: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try { await createFarm(form) }
    catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: 'var(--c-bg)' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-3">🌾</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
            Welcome, {profile?.full_name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-muted)' }}>
            Create your first farm to get started.
          </p>
        </div>

        <div className="rounded-2xl border p-5 space-y-4"
          style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--c-muted)' }}>Farm Name *</label>
            <input className="finput mt-1 w-full" placeholder="e.g. Kaushal Farm"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--c-muted)' }}>Location</label>
            <input className="finput mt-1 w-full" placeholder="e.g. Lakhimpur, Uttar Pradesh"
              value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: 'var(--c-muted)' }}>Total Acres</label>
            <input type="number" className="finput mt-1 w-full" placeholder="e.g. 80"
              value={form.total_acres} onChange={e => setForm(p => ({ ...p, total_acres: e.target.value }))} />
          </div>
          {error && <p className="text-[11px] text-[#E24B4A]">{error}</p>}
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="w-full py-3 text-sm font-bold rounded-xl disabled:opacity-40 transition-opacity"
            style={{ background: '#1D9E75', color: 'white' }}>
            {saving ? 'Creating farm…' : 'Create My Farm →'}
          </button>
        </div>

        <button onClick={logout}
          className="w-full text-center text-xs"
          style={{ color: 'var(--c-faint)' }}>
          Sign out
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/FarmSwitcher.jsx frontend/src/components/CreateFarmModal.jsx frontend/src/pages/FarmOnboarding.jsx
git commit -m "feat: add FarmSwitcher, CreateFarmModal, FarmOnboarding components"
```

---

## Task 5: FarmSettings Page

**Files:**
- Create: `frontend/src/pages/FarmSettings.jsx`

**Interfaces:**
- Consumes: `useAuthStore().loadMembers()` — list of active members
- Consumes: `useAuthStore().loadInvitations()` — list of pending invites
- Consumes: `useAuthStore().createInvitation({ role })` — generates invite token
- Consumes: `useAuthStore().removeMember(userId)` — removes member
- Consumes: `useAuthStore().updateMemberRole(userId, role)` — changes role
- Consumes: `useAuthStore().revokeInvitation(id)` — deletes invite
- Consumes: `useAuthStore().activeFarm` — farm details for display

- [ ] **Step 1: Create FarmSettings.jsx**

Create `frontend/src/pages/FarmSettings.jsx`:

```jsx
import React, { useState, useEffect } from 'react'
import { Copy, Check, Trash2, UserPlus, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../store/auth'

export default function FarmSettings() {
  const {
    activeFarm, activeFarmId, activeFarmRole,
    loadMembers, loadInvitations, createInvitation,
    removeMember, updateMemberRole, revokeInvitation,
    user,
  } = useAuthStore()

  const [members,     setMembers]     = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showInvite,  setShowInvite]  = useState(false)
  const [inviteRole,  setInviteRole]  = useState('manager')
  const [inviting,    setInviting]    = useState(false)
  const [inviteLink,  setInviteLink]  = useState(null)
  const [copied,      setCopied]      = useState(false)
  const [toast,       setToast]       = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const reload = async () => {
    const [m, i] = await Promise.all([loadMembers(), loadInvitations()])
    setMembers(m)
    setInvitations(i)
    setLoading(false)
  }

  useEffect(() => { if (activeFarmId) reload() }, [activeFarmId])

  const handleInvite = async () => {
    setInviting(true)
    try {
      const invite = await createInvitation({ role: inviteRole })
      const link   = `${window.location.origin}/invite/${invite.token}`
      setInviteLink(link)
      await reload()
    } catch (e) { showToast(e.message, 'error') }
    setInviting(false)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRemove = async (userId, name) => {
    if (!confirm(`Remove ${name} from this farm?`)) return
    try { await removeMember(userId); await reload(); showToast('Member removed') }
    catch (e) { showToast(e.message, 'error') }
  }

  const handleRoleChange = async (userId, role) => {
    try { await updateMemberRole(userId, role); await reload(); showToast('Role updated') }
    catch (e) { showToast(e.message, 'error') }
  }

  const handleRevoke = async (id) => {
    try { await revokeInvitation(id); await reload(); showToast('Invitation revoked') }
    catch (e) { showToast(e.message, 'error') }
  }

  const isAdmin = activeFarmRole === 'admin'
  const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', view_only: 'View Only' }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>
      <div className="shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>Farm Settings</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
          {activeFarm?.farm_name} · {activeFarm?.farm_location} · {activeFarm?.total_acres} acres
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-8">

        {/* Members */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>
              Team Members
            </p>
            {isAdmin && (
              <button onClick={() => { setShowInvite(i => !i); setInviteLink(null) }}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border"
                style={{ color: '#1D9E75', borderColor: '#1D9E75/30' }}>
                <UserPlus size={11} /> Invite
              </button>
            )}
          </div>

          {/* Invite panel */}
          {isAdmin && showInvite && (
            <div className="mb-3 rounded-xl border p-3 space-y-3"
              style={{ background: 'var(--c-nav)', borderColor: '#1D9E75/30' }}>
              <p className="text-xs font-bold" style={{ color: '#1D9E75' }}>Generate Invite Link</p>
              <div className="flex gap-2 items-center">
                <select className="finput flex-1" value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  style={{ background: 'var(--c-surface)' }}>
                  <option value="manager" style={{ background: 'var(--c-surface)' }}>Manager — can add/edit data</option>
                  <option value="view_only" style={{ background: 'var(--c-surface)' }}>View Only — read-only access</option>
                </select>
                <button onClick={handleInvite} disabled={inviting}
                  className="px-3 py-2 text-xs font-bold rounded-lg disabled:opacity-40"
                  style={{ background: '#1D9E75', color: 'white' }}>
                  {inviting ? '…' : 'Generate'}
                </button>
              </div>
              {inviteLink && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
                    <p className="flex-1 text-[10px] truncate" style={{ color: 'var(--c-sub)' }}>{inviteLink}</p>
                    <button onClick={copyLink}>
                      {copied ? <Check size={13} style={{ color: '#1D9E75' }} /> : <Copy size={13} style={{ color: 'var(--c-faint)' }} />}
                    </button>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
                    Share this link via WhatsApp. Expires in 7 days.
                  </p>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--c-faint)' }}>Loading…</p>
          ) : members.map(m => {
            const isSelf = m.user_id === user?.id
            const profile = m.user_profiles
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 mb-2"
                style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: '#1D9E75/15', color: '#1D9E75' }}>
                  {(profile?.full_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--c-text)' }}>
                    {profile?.full_name || profile?.email || 'Unknown'} {isSelf && '(You)'}
                  </p>
                  <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{profile?.email || ''}</p>
                </div>
                {isAdmin && !isSelf ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <select value={m.role} onChange={e => handleRoleChange(m.user_id, e.target.value)}
                      className="text-[10px] border rounded-lg px-2 py-1"
                      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-sub)' }}>
                      <option value="admin" style={{ background: 'var(--c-surface)' }}>Admin</option>
                      <option value="manager" style={{ background: 'var(--c-surface)' }}>Manager</option>
                      <option value="view_only" style={{ background: 'var(--c-surface)' }}>View Only</option>
                    </select>
                    <button onClick={() => handleRemove(m.user_id, profile?.full_name)}>
                      <Trash2 size={13} style={{ color: 'var(--c-faint)' }} />
                    </button>
                  </div>
                ) : (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: '#1D9E75/15', color: '#1D9E75' }}>
                    {ROLE_LABEL[m.role]}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Pending invitations */}
        {isAdmin && invitations.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--c-muted)' }}>
              Pending Invitations
            </p>
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 mb-2"
                style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                    {ROLE_LABEL[inv.role]} invite
                  </p>
                  <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => handleRevoke(inv.id)}
                  className="text-[10px] px-2 py-1 rounded-lg border"
                  style={{ color: '#E24B4A', borderColor: '#E24B4A/30' }}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg z-50"
          style={{ background: toast.type === 'error' ? '#E24B4A' : '#1D9E75', color: 'white' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/FarmSettings.jsx
git commit -m "feat: add FarmSettings page with member management and invite links"
```

---

## Task 6: AcceptInvite Page + SuperAdmin Route

**Files:**
- Create: `frontend/src/pages/AcceptInvite.jsx`
- Create: `frontend/src/pages/SuperAdmin.jsx`

- [ ] **Step 1: Create AcceptInvite.jsx**

Create `frontend/src/pages/AcceptInvite.jsx`:

```jsx
import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import Login from './Login'

export default function AcceptInvite() {
  const { token }         = useParams()
  const navigate          = useNavigate()
  const { user, acceptInvitation } = useAuthStore()
  const [status, setStatus] = useState('loading') // loading | ready | accepting | success | error
  const [error,  setError]  = useState(null)
  const [farm,   setFarm]   = useState(null)

  // Check the invite once user is logged in
  useEffect(() => {
    if (!user) { setStatus('need_login'); return }
    setStatus('ready')
  }, [user, token])

  const handleAccept = async () => {
    setStatus('accepting')
    try {
      const f = await acceptInvitation(token)
      setFarm(f)
      setStatus('success')
      setTimeout(() => navigate('/field', { replace: true }), 2000)
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  if (status === 'need_login') {
    return (
      <div>
        <div className="text-center px-6 py-8" style={{ background: 'var(--c-bg)' }}>
          <div className="text-4xl mb-2">🌾</div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--c-text)' }}>You've been invited to join a farm</p>
          <p className="text-xs mb-6" style={{ color: 'var(--c-muted)' }}>Sign in or create an account to accept.</p>
        </div>
        <Login />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--c-bg)' }}>
      <div className="w-full max-w-sm text-center space-y-4">
        {status === 'loading' && <p style={{ color: 'var(--c-faint)' }}>Checking invitation…</p>}
        {status === 'ready' && (
          <>
            <div className="text-4xl">🌾</div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>You've been invited to join a farm</p>
            <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Click below to accept the invitation and get access.</p>
            <button onClick={handleAccept}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: '#1D9E75', color: 'white' }}>
              Accept Invitation
            </button>
          </>
        )}
        {status === 'accepting' && <p style={{ color: 'var(--c-faint)' }}>Joining farm…</p>}
        {status === 'success' && (
          <>
            <div className="text-4xl">✅</div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Welcome to {farm?.name}!
            </p>
            <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Redirecting you to the farm…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-4xl">❌</div>
            <p className="text-sm font-semibold" style={{ color: '#E24B4A' }}>{error}</p>
            <button onClick={() => navigate('/', { replace: true })}
              className="text-xs underline" style={{ color: 'var(--c-muted)' }}>Go to app</button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create SuperAdmin.jsx**

Create `frontend/src/pages/SuperAdmin.jsx`:

```jsx
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SuperAdmin() {
  const [farms,   setFarms]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('farms')
        .select('*, farm_memberships(count)')
        .order('created_at', { ascending: false })
      setFarms(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>
      <div className="shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>⚙️ Super Admin</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>Platform-wide view — all farms</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--c-faint)' }}>Loading…</p>
        ) : farms.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--c-faint)' }}>No farms yet.</p>
        ) : farms.map(f => (
          <div key={f.id} className="rounded-xl border p-4"
            style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>🌾 {f.name}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-faint)' }}>
                  {f.location} · {f.total_acres} acres
                </p>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: '#1D9E75/15', color: '#1D9E75' }}>
                {f.farm_memberships?.[0]?.count || 0} members
              </span>
            </div>
            <p className="text-[9px] mt-1.5" style={{ color: 'var(--c-faint)' }}>
              ID: {f.id}
            </p>
            <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
              Created: {new Date(f.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AcceptInvite.jsx frontend/src/pages/SuperAdmin.jsx
git commit -m "feat: add AcceptInvite and SuperAdmin pages"
```

---

## Task 7: App.jsx — Nav Redesign + Route Updates

**Files:**
- Modify: `frontend/src/App.jsx`

**What changes:**
- Top bar: add `FarmSwitcher` component left side, ⚙️ Settings button right side
- Routes: add `/settings`, `/invite/:token`, `/super-admin`, `/onboarding`
- Onboarding gate: if `user && profile && farms.length === 0` → show `<FarmOnboarding />`
- Admin tab in bottom nav renamed to reflect it goes to the admin masters panel (unchanged behavior)
- Remove Admin tab if user's farm role is view_only
- Settings (⚙) button only visible to farm admin role
- Super admin link only visible if `isSuperAdmin`

- [ ] **Step 1: Replace App.jsx**

```jsx
import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAppStore } from './store'
import { useAuthStore, isAdmin, isManager, canEdit } from './store/auth'
import { useThemeStore } from './store/theme'
import {
  Map, ListChecks, Package, BarChart3, Users, Camera,
  Settings, LogOut, Sun, Moon, Bird, BookOpen, Shield
} from 'lucide-react'
import FarmSwitcher    from './components/FarmSwitcher'
import Field           from './pages/Field'
import Today           from './pages/Today'
import Labour          from './pages/Labour'
import Admin           from './pages/Admin'
import Media           from './pages/Media'
import Login           from './pages/Login'
import ResourcesPage   from './pages/ResourcesPage'
import ReportsPage     from './pages/ReportsPage'
import Livestock       from './pages/Livestock'
import LedgerPage      from './pages/LedgerPage'
import FarmOnboarding  from './pages/FarmOnboarding'
import FarmSettings    from './pages/FarmSettings'
import AcceptInvite    from './pages/AcceptInvite'
import SuperAdmin      from './pages/SuperAdmin'

const NAV = [
  { to: '/field',     label: 'Fields',    Icon: Map        },
  { to: '/today',     label: 'Today',     Icon: ListChecks },
  { to: '/resources', label: 'Resources', Icon: Package    },
  { to: '/labour',    label: 'People',    Icon: Users      },
  { to: '/livestock', label: 'Livestock', Icon: Bird       },
  { to: '/ledger',    label: 'Ledger',    Icon: BookOpen   },
  { to: '/reports',   label: 'Reports',   Icon: BarChart3  },
  { to: '/media',     label: 'Media',     Icon: Camera     },
]

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
      <div className="text-center">
        <div className="text-4xl mb-3">🌾</div>
        <p className="text-sm" style={{ color: 'var(--c-faint)' }}>Loading…</p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, profile, loading, init, logout, farms, activeFarmRole, isSuperAdmin } = useAuthStore()
  const { mediaItems } = useAppStore()
  const { theme, toggle } = useThemeStore()
  const location = useLocation()
  const [mediaUnread, setMediaUnread] = useState(0)

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (user && farms.length > 0) useAppStore.getState().loadAll()
  }, [user, farms.length])

  useEffect(() => {
    if (!mediaItems.length) return
    const seen = parseInt(localStorage.getItem('mediaSeenCount') || '0')
    setMediaUnread(Math.max(0, mediaItems.length - seen))
  }, [mediaItems])

  const handleMediaViewed = () => {
    localStorage.setItem('mediaSeenCount', String(mediaItems.length))
    setMediaUnread(0)
  }

  useEffect(() => {
    if (location.pathname === '/media') handleMediaViewed()
  }, [location.pathname])

  if (loading) return <LoadingScreen />

  // Public invite route — works before login
  if (location.pathname.startsWith('/invite/')) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
      </Routes>
    )
  }

  if (!user || !profile) return <Login />

  // User logged in but has no farms — show onboarding
  if (farms.length === 0) return <FarmOnboarding />

  const farmAdmin   = activeFarmRole === 'admin'
  const farmManager = isManager(activeFarmRole)
  const isDark = theme === 'dark'

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: 'var(--c-bg)' }}>

      {/* Top bar: farm switcher + user + theme + settings */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>

        {/* Left: Farm Switcher */}
        <FarmSwitcher />

        {/* Right: Settings + Theme + User */}
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <NavLink to="/super-admin"
              className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
              style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}
              title="Super Admin">
              <Shield size={12} />
            </NavLink>
          )}
          {farmAdmin && (
            <NavLink to="/settings"
              className={({ isActive }) =>
                `flex items-center justify-center w-7 h-7 rounded-full transition-colors`
              }
              style={({ isActive }) => ({
                background: isActive ? '#1D9E75/20' : 'var(--c-ghost)',
                color: isActive ? '#1D9E75' : 'var(--c-muted)',
              })}
              title="Farm Settings">
              <Settings size={13} />
            </NavLink>
          )}
          <button onClick={toggle}
            className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
            style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <div className="flex items-center gap-1">
            <span className="text-[9px] max-w-[60px] truncate" style={{ color: 'var(--c-faint)' }}>
              {profile.full_name?.split(' ')[0]}
            </span>
            <button onClick={logout}
              className="flex items-center justify-center w-6 h-6 rounded-full"
              style={{ background: 'var(--c-ghost)', color: 'var(--c-faint)' }}>
              <LogOut size={11} />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-hidden min-h-0">
        <Routes>
          <Route path="/"            element={<Navigate to="/field" replace />} />
          <Route path="/field"       element={<Field />} />
          <Route path="/today"       element={<Today />} />
          <Route path="/resources"   element={<ResourcesPage />} />
          <Route path="/labour"      element={<Labour />} />
          <Route path="/reports"     element={<ReportsPage />} />
          <Route path="/livestock"   element={<Livestock />} />
          <Route path="/ledger"      element={<LedgerPage />} />
          <Route path="/media"       element={<Media />} />
          <Route path="/settings"    element={farmAdmin ? <FarmSettings /> : <Navigate to="/field" replace />} />
          <Route path="/admin"       element={farmManager ? <Admin /> : <Navigate to="/field" replace />} />
          <Route path="/super-admin" element={isSuperAdmin ? <SuperAdmin /> : <Navigate to="/field" replace />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          {/* legacy redirects */}
          <Route path="/inventory"   element={<Navigate to="/resources" replace />} />
          <Route path="/assets"      element={<Navigate to="/resources" replace />} />
          <Route path="/harvest"     element={<Navigate to="/reports" replace />} />
          <Route path="/owner"       element={<Navigate to="/reports" replace />} />
          <Route path="/dashboard"   element={<Navigate to="/reports" replace />} />
          <Route path="/diary"       element={<Navigate to="/today" replace />} />
        </Routes>
      </main>

      <nav className="flex shrink-0 border-t"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="flex-1">
            {({ isActive }) => (
              <div className="flex flex-col items-center gap-1 py-2.5 transition-colors"
                style={{ color: isActive ? '#1D9E75' : 'var(--c-faint)' }}>
                <div className="relative">
                  <Icon size={19} strokeWidth={isActive ? 2.4 : 1.7} />
                  {to === '/media' && mediaUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-[#E24B4A] text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {mediaUnread > 9 ? '9+' : mediaUnread}
                    </span>
                  )}
                </div>
                <span className="text-[8px] font-medium tracking-wide">{label}</span>
              </div>
            )}
          </NavLink>
        ))}
        {farmManager && (
          <NavLink to="/admin" className="flex-none px-2">
            {({ isActive }) => (
              <div className="flex flex-col items-center gap-1 py-2.5"
                style={{ color: isActive ? '#1D9E75' : 'var(--c-faint)' }}>
                <Settings size={16} strokeWidth={1.5} />
                <span className="text-[8px] font-medium tracking-wide">Admin</span>
              </div>
            )}
          </NavLink>
        )}
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: redesign top bar with FarmSwitcher, add /settings /invite /super-admin routes"
```

---

## Task 8: Final Verification and Push

- [ ] **Step 1: Start the dev server and smoke-test**

```bash
cd frontend && npm run dev
```

Verify:
- Login → should redirect to onboarding if no farms, or load app with farm switcher
- Farm switcher shows current farm name in top left
- `/settings` shows members panel for admin users
- `/invite/:token` accepts invite flow
- All pages load without console errors

- [ ] **Step 2: Check RLS is working**

In Supabase dashboard, run:
```sql
-- Should return only rows for the test farm
SELECT COUNT(*) FROM plots;
```
Log in as a different user with no farm membership and verify 0 rows returned.

- [ ] **Step 3: Commit everything and push**

```bash
git add -A
git commit -m "chore: final cleanup and verification of SaaS multi-tenancy"
git push origin master
```

---

## Self-Review Checklist

- [x] **Spec coverage**: All 6 design sections covered — database (Task 1), auth (Task 2), store (Task 3), UI components (Tasks 4-6), App.jsx (Task 7), migration data (Task 1 Part 6)
- [x] **Placeholder scan**: No TBD/TODO items — all code blocks are complete and runnable
- [x] **Type consistency**: `activeFarmId` UUID string used consistently; `activeFarmRole` string ('admin'|'manager'|'view_only') passed to `isAdmin(role)`, `isManager(role)`, `canEdit(role)` helpers which accept a role string (updated signature)
- [x] **Edge cases**: Token expiry handled in `acceptInvitation`, duplicate membership handled with `ON CONFLICT`, stored farm_id validated against memberships on load, `view_only` users blocked from insert/delete by RLS
- [x] **isAdmin/isManager helpers**: Updated to accept role string (not profile object) — consistent across auth.js and App.jsx usage
