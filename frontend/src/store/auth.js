import { create } from 'zustand'
import { supabase } from '../lib/supabase'

async function fetchProfile(userId) {
  const { data } = await supabase
    .from('user_profiles').select('*').eq('id', userId).single()
  return data
}

const useAuthStore = create((set, get) => ({
  user:    null,
  profile: null,
  loading: true,
  users:   [],

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const profile = await fetchProfile(session.user.id)
      set({ user: session.user, profile, loading: false })
    } else {
      set({ loading: false })
    }
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') { set({ user: null, profile: null }); return }
      if (session?.user) {
        const profile = await fetchProfile(session.user.id)
        set({ user: session.user, profile })
      }
    })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const profile = await fetchProfile(data.user.id)
    if (!profile) throw new Error('Account not set up yet. Contact your admin.')
    if (!profile.is_active) throw new Error('Account deactivated. Contact your admin.')
    set({ user: data.user, profile })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  loadUsers: async () => {
    const { data } = await supabase
      .from('user_profiles').select('*').order('created_at')
    set({ users: data || [] })
  },

  createUser: async ({ email, password, full_name, role, phone }) => {
    // Save admin session before signUp replaces it
    const { data: { session } } = await supabase.auth.getSession()

    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error

      const { error: pErr } = await supabase.from('user_profiles').insert({
        id: data.user.id, email, full_name,
        role, phone: phone || null,
      })
      if (pErr) throw pErr

      await get().loadUsers()
      return data.user
    } finally {
      // Always restore admin session
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

// Role helpers
const isAdmin   = (p) => p?.role === 'admin'
const isManager = (p) => p?.role === 'admin' || p?.role === 'manager'
const canEdit   = (p) => p?.role !== 'view_only'

export { useAuthStore, isAdmin, isManager, canEdit }
