import { useState, useEffect } from 'react'
import { useAuthStore, isAdmin } from '../store/auth'

const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', view_only: 'View Only' }

export default function FarmSettings() {
  const {
    activeFarm, activeFarmId, farms, updateFarmDetails,
    loadMembers, removeMember, updateMemberRole,
    loadInvitations, createInvitation, revokeInvitation,
    user,
  } = useAuthStore()

  const [members,     setMembers]     = useState([])
  const [invitations, setInvitations] = useState([])
  const [editFarm,    setEditFarm]    = useState(false)
  const [farmForm,    setFarmForm]    = useState({ name: '', location: '', total_acres: '' })
  const [saving,      setSaving]      = useState(false)
  const [inviteRole,    setInviteRole]    = useState('manager')
  const [inviteeEmail,  setInviteeEmail]  = useState('')
  const [inviteePhone,  setInviteePhone]  = useState('')
  const [inviteLink,    setInviteLink]    = useState('')
  const [creating,      setCreating]      = useState(false)
  const [copied,        setCopied]        = useState(false)
  const [error,         setError]         = useState('')

  const activeFarmRole = farms.find(f => f.farm_id === activeFarmId)?.role || null
  const amAdmin = isAdmin(activeFarmRole)

  useEffect(() => {
    if (!activeFarm) return
    setFarmForm({ name: activeFarm.farm_name || '', location: activeFarm.farm_location || '', total_acres: activeFarm.total_acres || '' })
    loadMembers().then(setMembers)
    loadInvitations().then(invs => {
      setInvitations(invs)
      if (invs.length > 0 && invs[0].token) {
        setInviteLink(`${window.location.origin}/invite/${invs[0].token}`)
      }
    })
  }, [activeFarm?.farm_id])

  const handleSaveFarm = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updateFarmDetails(farmForm)
      setEditFarm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (userId, role) => {
    try {
      await updateMemberRole(userId, role)
      setMembers(ms => ms.map(m => m.user_id === userId ? { ...m, role } : m))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemove = async (userId) => {
    if (!window.confirm('Remove this member from the farm?')) return
    try {
      await removeMember(userId)
      setMembers(ms => ms.filter(m => m.user_id !== userId))
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCreateInvite = async () => {
    if (!inviteeEmail.trim() && !inviteePhone.trim()) {
      setError('Enter the invitee\'s email or mobile number before generating the link.')
      return
    }
    setCreating(true)
    setInviteLink('')
    setError('')
    try {
      const inv = await createInvitation({ role: inviteRole, email: inviteeEmail.trim(), phone: inviteePhone.trim() })
      const link = `${window.location.origin}/invite/${inv.token}`
      setInviteLink(link)
      setInvitations(is => [inv, ...is])
      setInviteeEmail('')
      setInviteePhone('')
    } catch (err) {
      setError(err?.message || err?.details || JSON.stringify(err) || 'Failed to generate invite link')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async (id) => {
    try {
      await revokeInvitation(id)
      setInvitations(is => is.filter(i => i.id !== id))
      if (inviteLink && invitations.find(i => i.id === id)) setInviteLink('')
    } catch (err) {
      setError(err.message)
    }
  }

  const card = { background: '#fff', borderRadius: '12px', border: '0.5px solid #e5e7eb', padding: '20px', marginBottom: '16px' }
  const label = { fontSize: '12px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'block' }
  const input = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 16px 80px' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: 800 }}>Farm Settings</h2>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Farm Details */}
      <div style={card}>
        <span style={label}>Farm Details</span>
        {editFarm ? (
          <form onSubmit={handleSaveFarm} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input style={input} placeholder="Farm name" value={farmForm.name} onChange={e => setFarmForm(f => ({ ...f, name: e.target.value }))} />
            <input style={input} placeholder="Location" value={farmForm.location} onChange={e => setFarmForm(f => ({ ...f, location: e.target.value }))} />
            <input style={input} type="number" placeholder="Total acres" value={farmForm.total_acres} onChange={e => setFarmForm(f => ({ ...f, total_acres: e.target.value }))} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={() => setEditFarm(false)} style={{ flex: 1, padding: '9px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: '8px', background: '#1D9E75', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>{activeFarm?.farm_name}</div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{activeFarm?.farm_location} · {activeFarm?.total_acres} acres</div>
            </div>
            {amAdmin && (
              <button onClick={() => setEditFarm(true)} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '13px' }}>Edit</button>
            )}
          </div>
        )}
      </div>

      {/* Members */}
      <div style={card}>
        <span style={label}>Members ({members.length})</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {members.map(m => {
            const isMe = m.user_id === user?.id
            const profile = m.user_profiles || {}
            return (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: '#f9fafb', borderRadius: '8px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                  {(profile.full_name || profile.email || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {profile.full_name || profile.email} {isMe ? '(you)' : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>{profile.email}</div>
                </div>
                {amAdmin && !isMe ? (
                  <>
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m.user_id, e.target.value)}
                      style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="view_only">View Only</option>
                    </select>
                    <button
                      onClick={() => handleRemove(m.user_id)}
                      style={{ padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', color: '#dc2626', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '12px', background: '#f0fdf4', color: '#166534', padding: '3px 8px', borderRadius: '99px', fontWeight: 600 }}>
                    {ROLE_LABELS[m.role]}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Invite */}
      {amAdmin && (
        <div style={card}>
          <span style={label}>Invite Someone</span>

          {/* Invitee contact — required for security */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input
              value={inviteeEmail}
              onChange={e => setInviteeEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              style={{ flex: 1, padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
            />
            <input
              value={inviteePhone}
              onChange={e => setInviteePhone(e.target.value)}
              placeholder="Mobile number"
              type="tel"
              style={{ flex: 1, padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
            🔒 Only someone with this email or mobile can accept the invite
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              style={{ flex: 1, padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
            >
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              <option value="view_only">View Only</option>
            </select>
            <button
              onClick={handleCreateInvite}
              disabled={creating}
              style={{ padding: '9px 16px', border: 'none', borderRadius: '8px', background: creating ? '#9ca3af' : '#1D9E75', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer' }}
            >
              {creating ? '…' : 'Generate Link'}
            </button>
          </div>

          {inviteLink && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600, marginBottom: '10px' }}>
                Invite link ready — valid 7 days, locked to the contact above
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    const msg = `You've been invited to join ${activeFarm?.farm_name || 'the farm'} on FarmApp as ${ROLE_LABELS[inviteRole]}.\n\nClick to accept:\n${inviteLink}`
                    if (navigator.share) {
                      navigator.share({ title: 'Farm Invitation', text: msg }).catch(() => {})
                    } else {
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
                    }
                  }}
                  style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', background: '#25D366', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Share on WhatsApp
                </button>
                <button
                  onClick={handleCopy}
                  style={{ padding: '10px 16px', border: '1px solid #bbf7d0', borderRadius: '8px', background: copied ? '#166534' : '#fff', color: copied ? '#fff' : '#166534', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {copied ? '✓ Copied' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}

          {invitations.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, marginBottom: '8px' }}>Pending Invitations</div>
              {invitations.map(inv => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px', marginBottom: '6px' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{ROLE_LABELS[inv.role]}</span>
                    {inv.email && <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '6px' }}>→ {inv.email}</span>}
                    {inv.invitee_phone && <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '6px' }}>📱 {inv.invitee_phone}</span>}
                    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '8px' }}>
                      · Expires {new Date(inv.expires_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {inv.token && (
                      <button
                        onClick={() => {
                          const link = `${window.location.origin}/invite/${inv.token}`
                          navigator.clipboard.writeText(link)
                          setInviteLink(link)
                        }}
                        style={{ padding: '3px 8px', border: '1px solid #bbf7d0', borderRadius: '6px', background: '#fff', color: '#166534', fontSize: '11px', cursor: 'pointer' }}
                      >
                        Copy Link
                      </button>
                    )}
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      style={{ padding: '3px 8px', border: '1px solid #fca5a5', borderRadius: '6px', background: '#fff', color: '#dc2626', fontSize: '11px', cursor: 'pointer' }}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
