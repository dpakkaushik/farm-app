import { create } from 'zustand'
import { supabase } from '../lib/supabase'

async function fetchProfile(userId) {
  const { data } = await supabase
    .from('user_profiles').select('*').eq('id', userId).single()
  return data
}

// The critical path: no farms means the app shows onboarding, so this query
// must fail loudly rather than return an empty list. It once selected a column
// that a not-yet-applied migration was going to add; PostgREST rejected the
// whole request, the error was dropped on the floor, and every existing member
// was shown "Welcome to Farm Manager — let's set up your farm". A query that
// failed and a user who genuinely has no farm are not the same thing.
//
// Keep this select to columns the app cannot run without. Anything optional —
// a setting, a preference — is read where it is needed, not here.
async function fetchMemberships(userId) {
  const { data, error } = await supabase
    .from('farm_memberships')
    .select('farm_id, role, status, farms(id, name, location, total_acres, map_state, overlay_config, created_at)')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (error) throw new Error(`Could not load your farms: ${error.message}`)
  return (data || []).map(m => ({
    farm_id:        m.farm_id,
    role:           m.role,
    farm_name:      m.farms?.name || 'Unnamed Farm',
    farm_location:  m.farms?.location || '',
    total_acres:    m.farms?.total_acres || 0,
    map_state:      m.farms?.map_state || null,
    overlay_config: m.farms?.overlay_config || null,
    // When the farm joined the app — the cutoff for "pre-app" history. A crop
    // sown before this date can carry an opening cost (mid-year onboarding).
    farm_created_at: m.farms?.created_at || null,
  }))
}

function getStoredFarmId() {
  try { return localStorage.getItem('active_farm_id') || null } catch { return null }
}

function storeActiveFarmId(id) {
  try {
    if (id) localStorage.setItem('active_farm_id', id)
    else localStorage.removeItem('active_farm_id')
  } catch {}
}

function resolveActiveFarm(memberships) {
  if (!memberships.length) return null
  const stored = getStoredFarmId()
  const stillMember = memberships.find(f => f.farm_id === stored)
  const chosen = stillMember ? stored : memberships[0].farm_id
  storeActiveFarmId(chosen)
  return chosen
}

const useAuthStore = create((set, get) => ({
  user:         null,
  profile:      null,
  loading:      true,
  users:        [],
  farms:        [],       // array of { farm_id, role, farm_name, ... }
  activeFarmId: null,
  activeFarm:   null,     // the membership object matching activeFarmId
  // Set when the memberships query itself failed. Distinct from farms: [] —
  // one means "we could not find out", the other means "you have none", and
  // only the second should ever open the new-farm wizard.
  farmsError:   null,

  // True while the first-run wizard is walking a new owner through farm → plots.
  // It has to exist because creating the farm flips farms.length from 0 to 1, and
  // App.jsx gates the wizard on farms.length === 0 — so without this the wizard
  // would be torn off the screen the instant the farm saved, before any plot was
  // added. In memory only: abandoning the wizard and reloading lands you in the
  // app with your farm, which is the right place to be.
  onboarding:   false,

  // ── Computed helpers (read from state, not reactive) ──────────────────────
  get isSuperAdmin() { return get().profile?.is_super_admin === true },
  get activeFarmRole() {
    const { activeFarmId, farms } = get()
    return farms.find(f => f.farm_id === activeFarmId)?.role || null
  },

  // ── Initialise on app boot ────────────────────────────────────────────────
  init: async () => {
    const load = async (user, rest) => {
      try {
        const [profile, memberships] = await Promise.all([
          fetchProfile(user.id),
          fetchMemberships(user.id),
        ])
        const activeFarmId = resolveActiveFarm(memberships)
        set({
          user, profile, farmsError: null, ...rest,
          farms: memberships, activeFarmId,
          activeFarm: memberships.find(f => f.farm_id === activeFarmId) || null,
        })
      } catch (err) {
        // Never fall through to farms: [] — that reads as "new user" and opens
        // the create-a-farm wizard on someone who already has farms.
        set({ user, farmsError: err.message || 'Could not load your farms', ...rest })
      }
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await load(session.user, { loading: false })
    else set({ loading: false })

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        storeActiveFarmId(null)
        set({ user: null, profile: null, farms: [], activeFarmId: null, activeFarm: null, farmsError: null })
        return
      }
      if (session?.user) await load(session.user, {})
    })
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
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
      user: data.user, profile, farmsError: null,
      farms: memberships, activeFarmId,
      activeFarm: memberships.find(f => f.farm_id === activeFarmId) || null,
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    storeActiveFarmId(null)
    set({ user: null, profile: null, farms: [], activeFarmId: null, activeFarm: null })
  },

  setOnboarding: (v) => set({ onboarding: v }),

  // ── Farm switching ────────────────────────────────────────────────────────
  switchFarm: (farmId) => {
    const { farms } = get()
    const farm = farms.find(f => f.farm_id === farmId)
    if (!farm) return
    storeActiveFarmId(farmId)
    set({ activeFarmId: farmId, activeFarm: farm })
    // Trigger full data reload for the new farm (lazy import to avoid circular)
    import('./index.js').then(m => m.useAppStore.getState().loadAll())
  },

  refreshFarms: async () => {
    const { user, activeFarmId } = get()
    if (!user) return
    const memberships = await fetchMemberships(user.id)
    const stillMember = memberships.find(f => f.farm_id === activeFarmId)
    const newActiveFarmId = stillMember ? activeFarmId : resolveActiveFarm(memberships)
    storeActiveFarmId(newActiveFarmId)
    set({
      farms: memberships, activeFarmId: newActiveFarmId,
      activeFarm: memberships.find(f => f.farm_id === newActiveFarmId) || null,
    })
  },

  // ── Farm CRUD ─────────────────────────────────────────────────────────────
  createFarm: async ({ name, location, total_acres, lat, lng }) => {
    const { user } = get()
    if (!user) throw new Error('Not logged in')

    const parsedLat = parseFloat(lat), parsedLng = parseFloat(lng)
    const map_state = (!isNaN(parsedLat) && !isNaN(parsedLng))
      ? { center: [parsedLng, parsedLat], zoom: 15 }
      : null

    // Use SECURITY DEFINER RPC — avoids RLS chicken-and-egg (farm exists before membership)
    const { data: farm, error } = await supabase.rpc('create_farm_with_membership', {
      p_name:        name,
      p_location:    location || 'India',
      p_total_acres: parseFloat(total_acres) || 0,
      p_map_state:   map_state,
    })
    if (error) throw error

    await get().refreshFarms()
    get().switchFarm(farm.id)
    return farm
  },

  updateFarmDetails: async (fields) => {
    const { activeFarmId } = get()
    if (!activeFarmId) throw new Error('No active farm')
    await get().updateFarm(activeFarmId, fields)
  },

  // Edit a specific farm by id (used by Manage Farms). RLS farms_update
  // restricts writes to admins of that farm.
  //
  // capex_threshold is only written when the caller passed it — Manage Farms
  // edits name/location/acres alone, and blindly parsing an absent field would
  // silently reset a farm's threshold to the default.
  updateFarm: async (farmId, { name, location, total_acres, capex_threshold }) => {
    if (!farmId) throw new Error('No farm specified')
    const patch = { name, location, total_acres: parseFloat(total_acres) || 0 }
    if (capex_threshold !== undefined && capex_threshold !== '') {
      patch.capex_threshold = Math.max(0, parseFloat(capex_threshold) || 0)
    }
    const { error } = await supabase.from('farms').update(patch).eq('id', farmId)
    if (error) throw error
    await get().refreshFarms()
  },

  // Persist the Field map's last position to the active farm, so it reopens where
  // you left it instead of on a hardcoded default. Called (debounced) on pan/zoom.
  //
  // RLS farms_update is admin-only: a manager's pan is rejected and swallowed here —
  // the home position is a farm setting, and they simply don't get to change it. The
  // local map still moved for their session; only persistence is denied. Patches the
  // in-memory farm rather than refetching, because this fires on every pan.
  saveActiveFarmMapState: async (mapState) => {
    const { activeFarmId } = get()
    if (!activeFarmId || !mapState) return
    const { error } = await supabase.from('farms')
      .update({ map_state: mapState })
      .eq('id', activeFarmId)
    if (error) return   // non-fatal: non-admin (RLS), offline, etc.
    set(s => ({
      farms: s.farms.map(f => f.farm_id === activeFarmId ? { ...f, map_state: mapState } : f),
      activeFarm: s.activeFarm && s.activeFarm.farm_id === activeFarmId
        ? { ...s.activeFarm, map_state: mapState }
        : s.activeFarm,
    }))
  },

  // Permanently delete a farm and — via ON DELETE CASCADE on all 37 farm-scoped
  // foreign keys — every plot, crop, ledger, diary and media row under it. RLS
  // farms_delete restricts this to admins; the typed-name confirmation lives in
  // the UI as an accident guard, not a security boundary.
  deleteFarm: async (farmId) => {
    if (!farmId) throw new Error('No farm specified')
    const { error } = await supabase.from('farms').delete().eq('id', farmId)
    if (error) throw error
    await get().refreshFarms()
  },

  // ── Invitation management ─────────────────────────────────────────────────
  createInvitation: async ({ role, email, phone }) => {
    const { activeFarmId, user } = get()
    if (!activeFarmId || !user) throw new Error('No active farm')
    const payload = { farm_id: activeFarmId, role, invited_by: user.id }
    if (email) payload.email = email.toLowerCase().trim()
    if (phone) payload.invitee_phone = phone.trim()
    const { data, error } = await supabase.from('farm_invitations').insert(payload).select().single()
    if (error) throw new Error(error.message || error.details || JSON.stringify(error))

    // Auto-send magic link email so invitee can join with one click, no password
    if (email && data?.token) {
      await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/invite/${data.token}`,
        },
      })
    }

    return data
  },

  loadInvitations: async () => {
    const { activeFarmId } = get()
    if (!activeFarmId) return []
    const { data } = await supabase
      .from('farm_invitations')
      .select('*')
      .eq('farm_id', activeFarmId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
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
      .select('*, user_profiles(id, full_name, email, role, is_active)')
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

  // ── Own profile (self-service) ────────────────────────────────────────────
  // RLS profiles_update allows a user to write their own row — no admin needed.
  updateMyProfile: async ({ full_name, phone, avatar_url }) => {
    const { user } = get()
    if (!user) throw new Error('Not logged in')

    const updates = {}
    if (full_name  !== undefined) updates.full_name  = full_name.trim()
    if (phone      !== undefined) updates.phone      = phone.trim()
    if (avatar_url !== undefined) updates.avatar_url = avatar_url

    const { data, error } = await supabase
      .from('user_profiles').update(updates).eq('id', user.id).select().single()
    if (error) throw error

    set({ profile: data })
    return data
  },

  // ── User management (admin panel — all users across platform) ─────────────
  loadUsers: async () => {
    const { data } = await supabase
      .from('user_profiles').select('*').order('created_at')
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
          access_token:  session.access_token,
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

// ── Role helpers (accept role string, not profile object) ─────────────────────
const isAdmin   = (role) => role === 'admin'
const isManager = (role) => role === 'admin' || role === 'manager'
const canEdit   = (role) => role !== null && role !== 'view_only'

// Compute role directly — Zustand getters don't survive set() shallow-merge.
// Use this (not the stale activeFarmRole field) for non-reactive reads via getState().
function getActiveFarmRole() {
  const { farms, activeFarmId } = useAuthStore.getState()
  return farms.find(f => f.farm_id === activeFarmId)?.role || null
}

export { useAuthStore, isAdmin, isManager, canEdit, getActiveFarmRole }
