import React, { useState } from 'react'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const { login } = useAuthStore()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try { await login(email, password) } catch (err) { setError(err.message) }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--c-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌾</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Farm Manager</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-faint)' }}>Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border p-6 space-y-4"
          style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none border focus:border-[#1D9E75]"
              style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border-md)', color: 'var(--c-text)' }} />
          </div>
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none border focus:border-[#1D9E75]"
              style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border-md)', color: 'var(--c-text)' }} />
          </div>
          {error && (
            <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 border border-[#E24B4A]/20 rounded-xl px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-opacity">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[10px] mt-6" style={{ color: 'var(--c-faint)' }}>
          Contact your admin if you don't have access
        </p>
      </div>
    </div>
  )
}
