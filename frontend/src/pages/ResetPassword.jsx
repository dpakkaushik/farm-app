import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Landing page for the password-reset email link.
//
// Supabase's recovery link puts a session in the URL fragment, which supabase-js
// consumes on load and turns into a PASSWORD_RECOVERY event. Once that session
// exists we can call updateUser({ password }) — the user never types their old
// password, because the emailed link IS the proof of ownership.
//
// Mounted in App.jsx BEFORE the auth/profile guards, or a recovering user with
// no name yet would get hijacked by the profile gate instead of landing here.
export default function ResetPassword() {
  const navigate = useNavigate()

  const [ready,     setReady]     = useState(false)   // recovery session established?
  const [checking,  setChecking]  = useState(true)
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [error,     setError]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    let settled = false

    // supabase-js fires this once it has parsed the recovery token out of the URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        settled = true
        setReady(true); setChecking(false)
      }
    })

    // Cover the case where the session was already restored before we subscribed.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { settled = true; setReady(true) }
      setChecking(false)
    })

    // If nothing established a session, the link is stale or was already used.
    const timer = setTimeout(() => {
      if (!settled) { setChecking(false); setReady(false) }
    }, 3000)

    return () => { sub.subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8)      { setError('Password must be at least 8 characters.'); return }
    if (password !== password2)   { setError('Passwords do not match.'); return }

    setSaving(true)
    const { error: upErr } = await supabase.auth.updateUser({ password })
    if (upErr) { setError(upErr.message); setSaving(false); return }

    setDone(true)
    setSaving(false)
    setTimeout(() => navigate('/', { replace: true }), 1200)
  }

  const wrap = (children) => (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f4c35 0%, #1D9E75 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '40px 36px',
        width: '100%', maxWidth: '420px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', textAlign: 'center',
      }}>
        {children}
      </div>
    </div>
  )

  const input = {
    width: '100%', padding: '12px 14px', border: '1.5px solid #d1d5db', borderRadius: '10px',
    fontSize: '15px', boxSizing: 'border-box', color: '#111827',
  }

  if (checking) return wrap(
    <><div style={{ fontSize: '40px', marginBottom: '16px' }}>🔑</div>
    <p style={{ color: '#6b7280' }}>Checking your reset link…</p></>
  )

  // No recovery session — link expired, already used, or opened in a different browser.
  if (!ready) return wrap(
    <>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>❌</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#dc2626' }}>Link expired</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.5 }}>
        This password reset link is no longer valid. Reset links can only be used once,
        and they expire. Request a fresh one from the sign-in screen.
      </p>
      <button onClick={() => navigate('/', { replace: true })}
        style={{ padding: '11px 24px', border: 'none', borderRadius: '10px', background: '#1D9E75', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
        Back to sign in
      </button>
    </>
  )

  if (done) return wrap(
    <>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#111827' }}>Password updated</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Signing you in…</p>
    </>
  )

  return wrap(
    <>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔑</div>
      <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800, color: '#111827' }}>Set a new password</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px' }}>
        Choose a password you'll use to sign in from now on.
      </p>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="New password (min 8 characters)" required autoFocus style={input} />
        <input type="password" value={password2} onChange={e => setPassword2(e.target.value)}
          placeholder="Confirm new password" required style={input} />

        {error && (
          <p style={{ color: '#dc2626', fontSize: '13px', margin: 0, textAlign: 'left' }}>{error}</p>
        )}

        <button type="submit" disabled={saving}
          style={{
            padding: '14px', border: 'none', borderRadius: '10px',
            background: saving ? '#9ca3af' : '#1D9E75', color: '#fff',
            fontSize: '16px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', marginTop: '4px',
          }}>
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </>
  )
}
