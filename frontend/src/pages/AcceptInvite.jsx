import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { supabase } from '../store/auth'

const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', view_only: 'View Only' }

export default function AcceptInvite() {
  const { token }    = useParams()
  const navigate     = useNavigate()
  const { user, acceptInvitation } = useAuthStore()

  const [status,   setStatus]   = useState('loading')
  const [preview,  setPreview]  = useState(null)   // { farm_name, role, email, valid }
  const [error,    setError]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [manualEmail, setManualEmail] = useState('')

  // Step 1: fetch invite preview (works without auth — public RPC)
  useEffect(() => {
    if (!token) { setStatus('error'); setError('Invalid invitation link.'); return }
    supabase.rpc('get_invite_preview', { p_token: token }).then(({ data }) => {
      if (!data) { setStatus('error'); setError('Invitation not found.'); return }
      if (!data.valid) { setStatus('error'); setError('This invitation has expired or was already used.'); return }
      setPreview(data)
      setStatus(user ? 'ready' : 'check_email')
    })
  }, [token])

  // Step 2: when user signs in via magic link, move to ready
  useEffect(() => {
    if (user && (status === 'check_email' || status === 'loading')) setStatus('ready')
  }, [user])

  const sendMagicLink = async (email) => {
    if (!email) return
    setSending(true)
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/invite/${token}` },
    })
    setSending(false)
    setSent(true)
  }

  const handleAccept = async () => {
    setStatus('accepting')
    try {
      const farm = await acceptInvitation(token)
      setStatus('success')
      setTimeout(() => navigate('/', { replace: true }), 2000)
    } catch (err) {
      setError(err.message || 'Failed to accept invitation')
      setStatus('error')
    }
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === 'loading') return wrap(
    <><div style={{ fontSize: '40px', marginBottom: '16px' }}>🌾</div>
    <p style={{ color: '#6b7280' }}>Checking invitation…</p></>
  )

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === 'error') return wrap(
    <>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>❌</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#dc2626' }}>Invitation Failed</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px' }}>{error}</p>
      <button onClick={() => navigate('/')}
        style={{ padding: '11px 24px', border: 'none', borderRadius: '10px', background: '#1D9E75', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
        Go to App
      </button>
    </>
  )

  // ── Not logged in → show magic link screen ────────────────────────────────
  if (status === 'check_email') {
    const inviteEmail = preview?.email
    return wrap(
      <>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌾</div>
        <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800, color: '#111827' }}>
          You're invited!
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.5 }}>
          Join <strong style={{ color: '#111827' }}>{preview?.farm_name}</strong> as{' '}
          <strong style={{ color: '#1D9E75' }}>{ROLE_LABELS[preview?.role]}</strong>
        </p>

        {sent ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>📧</div>
            <div style={{ fontWeight: 700, color: '#166534', marginBottom: '6px' }}>Check your email</div>
            <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>
              We sent a sign-in link to<br />
              <strong>{inviteEmail || manualEmail}</strong>
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
              Click the link in the email — no password needed. You'll land straight on this invitation.
            </div>
          </div>
        ) : (
          <>
            {inviteEmail ? (
              <>
                <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '14px', marginBottom: '20px', textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600, marginBottom: '4px' }}>INVITE SENT TO</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{inviteEmail}</div>
                </div>
                <button
                  onClick={() => sendMagicLink(inviteEmail)}
                  disabled={sending}
                  style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '10px', background: sending ? '#9ca3af' : '#1D9E75', color: '#fff', fontSize: '16px', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', marginBottom: '12px' }}>
                  {sending ? 'Sending…' : '📧 Send me a sign-in link'}
                </button>
              </>
            ) : (
              <>
                <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px' }}>
                  Enter your email to receive a sign-in link — no password needed.
                </p>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={e => setManualEmail(e.target.value)}
                  placeholder="Your email address"
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #d1d5db', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', marginBottom: '12px', color: '#111827' }}
                />
                <button
                  onClick={() => sendMagicLink(manualEmail)}
                  disabled={sending || !manualEmail}
                  style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '10px', background: sending || !manualEmail ? '#9ca3af' : '#1D9E75', color: '#fff', fontSize: '16px', fontWeight: 700, cursor: 'pointer', marginBottom: '12px' }}>
                  {sending ? 'Sending…' : '📧 Send sign-in link'}
                </button>
              </>
            )}
          </>
        )}

        <button onClick={() => navigate('/login?next=/invite/' + token)}
          style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
          Already have an account? Sign in instead
        </button>
      </>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (status === 'success') return wrap(
    <>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>You're in!</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
        You've joined <strong>{preview?.farm_name}</strong>. Taking you to your farm…
      </p>
    </>
  )

  // ── Ready to accept ───────────────────────────────────────────────────────
  return wrap(
    <>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌾</div>
      <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800, color: '#111827' }}>Farm Invitation</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 4px' }}>You've been invited to join</p>
      <p style={{ color: '#111827', fontSize: '20px', fontWeight: 800, margin: '0 0 4px' }}>{preview?.farm_name}</p>
      <p style={{ color: '#1D9E75', fontSize: '14px', fontWeight: 600, margin: '0 0 28px' }}>as {ROLE_LABELS[preview?.role]}</p>

      <button
        onClick={handleAccept}
        disabled={status === 'accepting'}
        style={{
          width: '100%', padding: '14px', border: 'none', borderRadius: '10px',
          background: status === 'accepting' ? '#9ca3af' : '#1D9E75', color: '#fff',
          fontSize: '16px', fontWeight: 700, cursor: status === 'accepting' ? 'not-allowed' : 'pointer', marginBottom: '12px',
        }}>
        {status === 'accepting' ? 'Joining…' : 'Accept Invitation →'}
      </button>
      <button onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '13px', cursor: 'pointer' }}>
        Decline
      </button>
    </>
  )
}
