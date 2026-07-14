import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import ImageCropper from '../components/ImageCropper'
import { uploadAttachment, resolveUrl } from '../lib/attachments'

// Serves two roles:
//   <Profile mustComplete />  → the gate. Invited users arrive with only an
//                               email; they cannot enter the app until they've
//                               given a name and mobile. No skip.
//   <Profile />               → the /profile edit page, reachable any time.
export default function Profile({ mustComplete = false }) {
  const navigate = useNavigate()
  const { user, profile, updateMyProfile } = useAuthStore()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone,    setPhone]    = useState(profile?.phone     || '')
  const [avatar,   setAvatar]   = useState(profile?.avatar_url || null)
  const [saving,   setSaving]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const [error,    setError]    = useState('')
  const [saved,    setSaved]    = useState(false)
  const fileRef = useRef(null)

  const nameOk  = fullName.trim().length >= 2
  const phoneOk = /^[0-9]{10}$/.test(phone.replace(/\D/g, ''))
  const canSave = nameOk && phoneOk && !saving && !uploading

  // An avatar renders in a circle, so it goes through the cropper before it is uploaded.
  const pickPhoto = async (file) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const path = await uploadAttachment(file, { folder: 'avatars', entityId: user.id })
      setAvatar(resolveUrl(path))
    } catch (e) {
      setError('Photo upload failed: ' + e.message)
    }
    setUploading(false)
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await updateMyProfile({
        full_name:  fullName,
        phone:      phone.replace(/\D/g, ''),
        avatar_url: avatar,
      })
      setSaved(true)
      // The gate unmounts itself once the store has a complete profile.
      if (!mustComplete) setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.message || 'Could not save your profile')
    }
    setSaving(false)
  }

  const initial = (fullName || profile?.email || '?')[0].toUpperCase()

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--c-bg)' }}>
      <div className="mx-auto px-5 pt-8 pb-10" style={{ maxWidth: '440px' }}>

        {mustComplete ? (
          <>
            <h1 className="text-xl font-extrabold" style={{ color: 'var(--c-text)' }}>
              👋 Welcome — one quick step
            </h1>
            <p className="text-xs mt-1.5 mb-6" style={{ color: 'var(--c-muted)' }}>
              Tell us who you are so your name shows on the activity you log,
              instead of your email address.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-extrabold" style={{ color: 'var(--c-text)' }}>Your Profile</h1>
            <p className="text-xs mt-1.5 mb-6" style={{ color: 'var(--c-muted)' }}>
              Visible to others on your farm.
            </p>
          </>
        )}

        {/* Avatar */}
        <div className="flex flex-col items-center mb-7">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative w-24 h-24 rounded-full flex items-center justify-center font-extrabold text-3xl overflow-hidden"
            style={{ background: '#1D9E75', color: '#fff' }}>
            {avatar
              ? <img src={avatar} alt="" className="w-full h-full object-cover" />
              : initial}
            <span
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center border-2"
              style={{ background: 'var(--c-nav)', borderColor: 'var(--c-bg)', color: 'var(--c-sub)' }}>
              <Camera size={14} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCropFile(f) }}
          />
          {cropFile && (
            <ImageCropper file={cropFile}
              onDone={f => { setCropFile(null); pickPhoto(f) }}
              onCancel={() => setCropFile(null)} />
          )}
          <p className="text-[11px] mt-2" style={{ color: 'var(--c-faint)' }}>
            {uploading ? 'Uploading…' : 'Tap to add a photo (optional)'}
          </p>
        </div>

        {/* Email — fixed, this is their login */}
        <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--c-muted)' }}>
          EMAIL
        </label>
        <div
          className="w-full px-3.5 py-2.5 rounded-xl text-sm mb-4"
          style={{ background: 'var(--c-ghost)', color: 'var(--c-faint)', border: '1px solid var(--c-border)' }}>
          {profile?.email}
        </div>

        {/* Name */}
        <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--c-muted)' }}>
          FULL NAME <span style={{ color: '#E24B4A' }}>*</span>
        </label>
        <input
          className="finput mb-4"
          placeholder="e.g. Ramesh Kumar"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
        />

        {/* Mobile */}
        <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--c-muted)' }}>
          MOBILE <span style={{ color: '#E24B4A' }}>*</span>
        </label>
        <input
          className="finput"
          type="tel"
          inputMode="numeric"
          placeholder="10-digit number"
          value={phone}
          onChange={e => setPhone(e.target.value)}
        />
        {phone && !phoneOk && (
          <p className="text-[11px] mt-1" style={{ color: '#BA7517' }}>
            Enter a 10-digit mobile number.
          </p>
        )}

        {error && (
          <div
            className="mt-4 px-3.5 py-2.5 rounded-xl text-xs"
            style={{ background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.35)', color: '#E24B4A' }}>
            {error}
          </div>
        )}

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full mt-6 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: saved ? '#16a34a' : '#1D9E75', color: '#fff' }}>
          {saved   ? <><Check size={15} /> Saved</>
           : saving ? 'Saving…'
           : mustComplete ? 'Continue →'
           : 'Save changes'}
        </button>

        {!mustComplete && (
          <button
            onClick={() => navigate(-1)}
            className="w-full mt-2 py-2.5 text-xs"
            style={{ color: 'var(--c-faint)' }}>
            Back
          </button>
        )}
      </div>
    </div>
  )
}
