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
    farm_id:        m.farm_id,
    role:           m.role,
    farm_name:      m.farms?.name || 'Unnamed Farm',
    farm_location:  m.farms?.location || '',
    total_acres:    m.farms?.total_acres || 0,
    map_state:      m.farms?.map_state || null,
    overlay_config: m.farms?.overlay_config || null,
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
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const [profile, memberships] = await Promise.all([
        fetchProfile(session.user.id),
        fetchMemberships(session.user.id),
      ])
      const activeFarmId = resolveActiveFarm(memberships)
      set({
        user: session.user, profile, loading: false,
        farms: memberships, activeFarmId,
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

  updateFarmDetails: async ({ name, location, total_acres }) => {
    const { activeFarmId } = get()
    if (!activeFarmId) throw new Error('No active farm')
    await get().updateFarm(activeFarmId, { name, location, total_acres })
  },

  // Edit a specific farm by id (used by Manage Farms). RLS farms_update
  // restricts writes to admins of that farm.
  updateFarm: async (farmId, { name, location, total_acres }) => {
    if (!farmId) throw new Error('No farm specified')
    const { error } = await supabase.from('farms')
      .update({ name, location, total_acres: parseFloat(total_acres) || 0 })
      .eq('id', farmId)
    if (error) throw error
    await get().refreshFarms()
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
