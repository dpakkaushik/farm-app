import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function AcceptInvite() {
  const { token }           = useParams()
  const navigate            = useNavigate()
  const { user, acceptInvitation } = useAuthStore()

  const [status, setStatus] = useState('loading')   // loading | need_login | ready | accepting | success | error
  const [farm,   setFarm]   = useState(null)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setError('Invalid invitation link'); return }
    if (!user)  { setStatus('need_login'); return }
    setStatus('ready')
  }, [token, user])

  const handleAccept = async () => {
    setStatus('accepting')
    try {
      const f = await acceptInvitation(token)
      setFarm(f)
      setStatus('success')
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setError(err.message || 'Failed to accept invitation')
      setStatus('error')
    }
  }

  const wrap = (children) => (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #0f4c35 0%, #1D9E75 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '40px 36px', width: '100%',
        maxWidth: '420px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', textAlign: 'center',
      }}>
        {children}
      </div>
    </div>
  )

  if (status === 'loading') return wrap(
    <><div style={{ fontSize: '40px', marginBottom: '16px' }}>🌾</div><p style={{ color: '#6b7280' }}>Checking invitation…</p></>
  )

  if (status === 'need_login') return wrap(
    <>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔐</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>Sign in first</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px' }}>
        You need to be signed in to accept this farm invitation.
      </p>
      <button
        onClick={() => navigate(`/login?next=/invite/${token}`)}
        style={{ width: '100%', padding: '13px', border: 'none', borderRadius: '10px', background: '#1D9E75', color: '#fff', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
      >
        Sign In →
      </button>
    </>
  )

  if (status === 'success') return wrap(
    <>
      <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>You're in!</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
        You've joined <strong>{farm?.name}</strong>. Redirecting to your farm…
      </p>
    </>
  )

  if (status === 'error') return wrap(
    <>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>❌</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#dc2626' }}>Invitation Failed</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px' }}>{error}</p>
      <button
        onClick={() => navigate('/')}
        style={{ padding: '11px 24px', border: 'none', borderRadius: '10px', background: '#1D9E75', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}
      >
        Go to App
      </button>
    </>
  )

  return wrap(
    <>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌾</div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>Farm Invitation</h2>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 28px', lineHeight: 1.5 }}>
        You've been invited to join a farm. Click below to accept and gain access.
      </p>
      <button
        onClick={handleAccept}
        disabled={status === 'accepting'}
        style={{
          width: '100%', padding: '13px', border: 'none', borderRadius: '10px',
          background: status === 'accepting' ? '#9ca3af' : '#1D9E75', color: '#fff',
          fontSize: '16px', fontWeight: 700, cursor: status === 'accepting' ? 'not-allowed' : 'pointer',
        }}
      >
        {status === 'accepting' ? 'Joining…' : 'Accept Invitation →'}
      </button>
      <button
        onClick={() => navigate('/')}
        style={{ marginTop: '12px', background: 'none', border: 'none', color: '#9ca3af', fontSize: '13px', cursor: 'pointer' }}
      >
        Decline
      </button>
    </>
  )
}
