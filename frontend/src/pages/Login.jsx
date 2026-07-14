import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { login } = useAuthStore()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [mode,     setMode]     = useState('password')  // 'password' | 'magic' | 'reset' | 'signup'
  const [magicSent, setMagicSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [fullName,   setFullName]   = useState('')
  const [signupSent, setSignupSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try { await login(email, password) } catch (err) { setError(err.message) }
    setLoading(false)
  }

  const signUp = async (e) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // full_name is read by the handle_new_user() trigger, which provisions the
        // user_profiles row. Without it the profile falls back to the email prefix.
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      // Signing up with an already-registered email does NOT error — Supabase returns
      // a decoy user with no identities, so this page can't be used to probe which
      // emails have accounts. It's indistinguishable from success, so say the one
      // thing that helps rather than sending them to an inbox with nothing in it.
      if (data.user && data.user.identities?.length === 0) {
        setError('An account with this email already exists — sign in instead.')
      } else {
        setSignupSent(true)
      }
    } catch (err) {
      setError(err.message || 'Could not create account')
    }
    setLoading(false)
  }

  const switchMode = (m) => {
    setMode(m); setError('')
    setMagicSent(false); setResetSent(false); setSignupSent(false)
  }

  const sendReset = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setResetSent(true)
    } catch (err) {
      setError(err.message || 'Failed to send reset link')
    }
    setLoading(false)
  }

  const sendMagicLink = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })
      if (error) throw error
      setMagicSent(true)
    } catch (err) {
      setError(err.message || 'Failed to send login link')
    }
    setLoading(false)
  }

  const inputCls = 'w-full rounded-xl px-4 py-3 text-sm outline-none border focus:border-[#1D9E75]'
  const inputStyle = { background: 'var(--c-ghost)', borderColor: 'var(--c-border-md)', color: 'var(--c-text)' }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--c-bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌾</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Farm Manager</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-faint)' }}>Sign in to continue</p>
        </div>

        <div className="rounded-2xl border p-6" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>

          {/* Mode tabs — only for the two ways to sign in. Reset and signup are
              destinations you arrive at from a link below, not siblings of these. */}
          {(mode === 'password' || mode === 'magic') && (
            <div className="flex rounded-xl overflow-hidden border mb-5" style={{ borderColor: 'var(--c-border-md)' }}>
              {['password', 'magic'].map(m => (
                <button key={m} onClick={() => switchMode(m)}
                  className="flex-1 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: mode === m ? '#1D9E75' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--c-muted)',
                    border: 'none', cursor: 'pointer',
                  }}>
                  {m === 'password' ? '🔑 Password' : '📧 Email Link'}
                </button>
              ))}
            </div>
          )}

          {/* Password mode */}
          {mode === 'password' && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required className={inputCls} style={inputStyle} />
              </div>
              {error && <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 border border-[#E24B4A]/20 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm disabled:opacity-50">
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <button type="button" onClick={() => switchMode('reset')}
                className="w-full text-xs text-center" style={{ background: 'none', border: 'none', color: '#1D9E75', cursor: 'pointer', paddingTop: '4px' }}>
                Forgot password?
              </button>
              <button type="button" onClick={() => switchMode('magic')}
                className="w-full text-xs text-center" style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer' }}>
                No password? Send me a login link →
              </button>
              <div className="pt-3 mt-1 border-t text-center" style={{ borderColor: 'var(--c-border-md)' }}>
                <span className="text-xs" style={{ color: 'var(--c-muted)' }}>New to Farm Manager? </span>
                <button type="button" onClick={() => switchMode('signup')}
                  className="text-xs font-semibold" style={{ background: 'none', border: 'none', color: '#1D9E75', cursor: 'pointer' }}>
                  Create your farm →
                </button>
              </div>
            </form>
          )}

          {/* Sign-up mode — the only path that mints a new account. Everything
              downstream is already wired: the handle_new_user() trigger creates the
              profile, and App.jsx walks a farmless user into the setup wizard. */}
          {mode === 'signup' && (
            <form onSubmit={signUp} className="space-y-4">
              {signupSent ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">✉️</div>
                  <div className="font-bold text-sm mb-2" style={{ color: 'var(--c-text)' }}>Confirm your email</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)', lineHeight: 1.6 }}>
                    We sent a confirmation link to<br />
                    <strong style={{ color: 'var(--c-text)' }}>{email}</strong><br />
                    Click it, then come back here and sign in with your password to set up your farm.
                  </div>
                  <button type="button" onClick={() => switchMode('password')}
                    className="text-xs mt-4" style={{ background: 'none', border: 'none', color: '#1D9E75', cursor: 'pointer', textDecoration: 'underline' }}>
                    ← Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: 'var(--c-muted)', lineHeight: 1.5 }}>
                    Create your account, then we'll walk you through setting up your farm and its plots.
                  </p>
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Full Name</label>
                    <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Deepak Kaushik" required className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required className={inputCls} style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="At least 8 characters" required className={inputCls} style={inputStyle} />
                  </div>
                  {error && <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 border border-[#E24B4A]/20 rounded-xl px-3 py-2">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm disabled:opacity-50">
                    {loading ? 'Creating account…' : 'Create Account'}
                  </button>
                  <button type="button" onClick={() => switchMode('password')}
                    className="w-full text-xs text-center" style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer' }}>
                    ← Already have an account? Sign in
                  </button>
                </>
              )}
            </form>
          )}

          {/* Forgot password mode */}
          {mode === 'reset' && (
            <form onSubmit={sendReset} className="space-y-4">
              {resetSent ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">🔑</div>
                  <div className="font-bold text-sm mb-2" style={{ color: 'var(--c-text)' }}>Check your inbox</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)', lineHeight: 1.6 }}>
                    We sent a password reset link to<br />
                    <strong style={{ color: 'var(--c-text)' }}>{email}</strong><br />
                    Click it to choose a new password.
                  </div>
                  <button type="button" onClick={() => setResetSent(false)}
                    className="text-xs mt-4" style={{ background: 'none', border: 'none', color: '#1D9E75', cursor: 'pointer', textDecoration: 'underline' }}>
                    Resend link
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: 'var(--c-muted)', lineHeight: 1.5 }}>
                    Enter your email and we'll send you a link to set a new password.
                  </p>
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required className={inputCls} style={inputStyle} />
                  </div>
                  {error && <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 border border-[#E24B4A]/20 rounded-xl px-3 py-2">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm disabled:opacity-50">
                    {loading ? 'Sending…' : '🔑 Send Reset Link'}
                  </button>
                  <button type="button" onClick={() => switchMode('password')}
                    className="w-full text-xs text-center" style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer' }}>
                    ← Back to sign in
                  </button>
                </>
              )}
            </form>
          )}

          {/* Magic link mode */}
          {mode === 'magic' && (
            <form onSubmit={sendMagicLink} className="space-y-4">
              {magicSent ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">📧</div>
                  <div className="font-bold text-sm mb-2" style={{ color: 'var(--c-text)' }}>Check your inbox</div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)', lineHeight: 1.6 }}>
                    We sent a sign-in link to<br />
                    <strong style={{ color: 'var(--c-text)' }}>{email}</strong><br />
                    Click it to sign in — no password needed.
                  </div>
                  <button type="button" onClick={() => setMagicSent(false)}
                    className="text-xs mt-4" style={{ background: 'none', border: 'none', color: '#1D9E75', cursor: 'pointer', textDecoration: 'underline' }}>
                    Resend link
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: 'var(--c-muted)', lineHeight: 1.5 }}>
                    Enter your email and we'll send you a one-click sign-in link. No password needed.
                  </p>
                  <div>
                    <label className="text-xs block mb-1.5" style={{ color: 'var(--c-muted)' }}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" required className={inputCls} style={inputStyle} />
                  </div>
                  {error && <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/10 border border-[#E24B4A]/20 rounded-xl px-3 py-2">{error}</p>}
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm disabled:opacity-50">
                    {loading ? 'Sending…' : '📧 Send Login Link'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-[10px] mt-6" style={{ color: 'var(--c-faint)' }}>
          Contact your admin if you don't have access
        </p>
      </div>
    </div>
  )
}
