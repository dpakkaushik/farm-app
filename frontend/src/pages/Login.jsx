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
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌾</div>
          <h1 className="text-xl font-bold text-white">Farm Manager</h1>
          <p className="text-sm text-white/35 mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="bg-[#161a23] rounded-2xl border border-white/8 p-6 space-y-4">
          <div>
            <label className="text-xs text-white/50 block mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              className="w-full bg-white/8 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1D9E75]"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1.5">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              className="w-full bg-white/8 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#1D9E75]"
            />
          </div>
          {error && (
            <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 border border-[#E24B4A]/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-opacity">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[10px] text-white/20 mt-6">
          Contact your admin if you don't have access
        </p>
      </div>
    </div>
  )
}
