// One route, three faces.
//
// Pets, Birds and Animals share this screen because they share money and they
// share the vet: split into three routes and nothing can answer "what did
// livestock cost me this month", and the single visit that sees the buffalo and
// the dog on one trip has to be entered twice. So the separation is by content,
// not navigation — the group in the URL decides the title, the icon, the header
// counts, what the three tabs are called and how money is treated. A herd is
// names that earn, a flock is a number, a pet only ever costs.
//
// This file is the shell: URL state, photo plumbing, toast, header, tabs. The
// tabs themselves live in ./livestock/*.
import React, { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store'
import ImageViewer from '../components/ImageViewer'
import ImageCropper from '../components/ImageCropper'
import { uploadAttachment, deleteAttachment, resolveUrl } from '../lib/attachments'
import HealthTab, { CheckupBanner, pendingCheckups } from './livestock/health'
import AnimalsTab from './livestock/animals'
import FinanceTab from './livestock/finance'
import { AddLivestockModal, EditLivestockModal, CountModal, CloseModal } from './livestock/modals'
import {
  GROUPS, GROUP_KEYS, groupOf, faceOf, isActive, costToDate, animalLabel, fmtK,
} from './livestock/ui'

// The URL keys never change with the group — 'animals' is the list tab and
// 'finance' the money tab whatever the face calls them — so a bookmark and the
// profile menu's deep link both keep working.
const TAB_KEYS = ['animals', 'health', 'finance']

export default function Livestock() {
  const {
    livestockMaster, livestockCountLogs, livestockHealthLogs, farmExpenses,
    addLivestock, updateLivestock, addLivestockCountLog, addLivestockRevenue,
    closeLivestock, updateAssetPhoto,
  } = useAppStore()

  // Both the page tab and the group live in the URL, so the profile menu can
  // deep-link straight to Pets (/livestock?group=pets) and land on the right
  // face even when the last visit ended on Finance. Switching replaces rather
  // than pushes: Back should leave the screen, not walk the tabs.
  const [params, setParams] = useSearchParams()
  const tab   = TAB_KEYS.includes(params.get('tab'))     ? params.get('tab')   : 'animals'
  const group = GROUP_KEYS.includes(params.get('group')) ? params.get('group') : 'animals'
  const goTo = (nextTab, nextGroup) => {
    const q = {}
    if (nextTab   !== 'animals') q.tab   = nextTab
    if (nextGroup !== 'animals') q.group = nextGroup
    setParams(q, { replace: true })
  }
  const setTab = t => goTo(t, group)

  const [editModal,  setEditModal]  = useState(null)
  const [countModal, setCountModal] = useState(null)
  const [closeModal, setCloseModal] = useState(null)
  const [addModal,   setAddModal]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState(null)
  const photoInputRef  = useRef()
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [cropFile,     setCropFile]     = useState(null)
  const [photoView,    setPhotoView]    = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  // A photo that exists opens in the viewer (which carries Change and Remove).
  // Only an empty slot jumps straight to the picker.
  const handlePhotoClick = (table, item) => {
    if (item.photoUrl) return setPhotoView({ table, item })
    setPendingPhoto({ table, id: item.id })
    photoInputRef.current?.click()
  }

  // Picked from an empty slot → crop before it ever reaches Storage.
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file && pendingPhoto) setCropFile(file)
  }

  const savePhoto = async (table, id, file, oldUrl) => {
    setSaving(true)
    try {
      const path = await uploadAttachment(file, { folder: `asset_photos/${table}`, entityId: id })
      await updateAssetPhoto(table, id, resolveUrl(path))
      if (oldUrl) await deleteAttachment(oldUrl)   // don't orphan the file we just replaced
      showToast('Photo updated')
    } catch (err) { showToast('Upload failed: ' + err.message, 'error'); throw err }
    finally { setSaving(false); setPendingPhoto(null); setCropFile(null) }
  }

  const removePhoto = async (table, id, oldUrl) => {
    setSaving(true)
    try {
      await updateAssetPhoto(table, id, null)
      if (oldUrl) await deleteAttachment(oldUrl)
      showToast('Photo removed')
    } catch (err) { showToast('Failed: ' + err.message, 'error'); throw err }
    finally { setSaving(false) }
  }

  const confirmEdit = async (data) => {
    if (!editModal) return
    setSaving(true)
    try {
      await updateLivestock(editModal.id, data)
      showToast('Saved'); setEditModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmCount = async (form) => {
    if (!countModal || !form.quantity || Number(form.quantity) <= 0) return showToast('Enter valid quantity', 'warn')
    setSaving(true)
    try {
      await addLivestockCountLog({ livestockId: countModal.animal.id, date: form.date, changeType: countModal.changeType, reason: form.reason, quantity: parseInt(form.quantity), notes: form.notes })
      showToast('Count updated'); setCountModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmAdd = async (form) => {
    setSaving(true)
    try {
      await addLivestock(form)
      showToast(`${form.name} added`); setAddModal(false)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  // A sale with money in it goes down the revenue path, which already closes the
  // account and puts the amount in the ledger and the cash book. Everything else
  // — died, rehomed, given away, or a sale with no figure — is a status change
  // and nothing more, because livestock_master has no column to hold an amount.
  const confirmClose = async ({ status, word, date, amount, notes }) => {
    if (!closeModal) return
    const amt = parseFloat(amount) || 0
    setSaving(true)
    try {
      if (status === 'sold' && amt > 0) {
        await addLivestockRevenue({
          livestockId: closeModal.id, revenueDate: date, revenueType: 'sale',
          amount: amt, paymentMode: 'cash', isSale: true,
          notes: notes || `Sold — ${animalLabel(closeModal)}`,
        })
      } else {
        await closeLivestock(closeModal.id, { status, date, reason: word, notes })
      }
      showToast(`${animalLabel(closeModal)} closed`)
      setCloseModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const face        = faceOf(group)
  const groupAll    = livestockMaster.filter(l => groupOf(l) === group)
  const groupActive = groupAll.filter(isActive)
  const groupClosed = groupAll.filter(l => !isActive(l))
  const checkups    = pendingCheckups(groupActive, livestockHealthLogs)

  // What the header counts is the first thing that has to differ between the
  // faces: a herd is worth something, a flock is a headcount, a pet is a bill.
  const chips = (() => {
    const n = groupActive.length
    if (group === 'birds') {
      const birds = groupActive.reduce((s, l) => s + (l.currentCount || 0), 0)
      return [{ text: `${n} ${n === 1 ? 'flock' : 'flocks'}` },
              birds ? { text: `${birds} birds`, color: '#4169E1' } : null]
    }
    if (group === 'pets') {
      const spend = groupActive.reduce((s, l) => s + costToDate(l, farmExpenses), 0)
      return [{ text: `${n} ${n === 1 ? 'pet' : 'pets'}` },
              spend ? { text: `${fmtK(spend)} to date`, color: '#E24B4A' } : null]
    }
    const value = groupActive.reduce((s, l) => s + (l.purchasePrice || 0), 0)
    return [{ text: `${n} head` },
            value ? { text: `${fmtK(value)} book value`, color: '#1D9E75' } : null]
  })().filter(Boolean)

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      {/* Crop on the way in, for a photo picked into an empty slot */}
      {cropFile && pendingPhoto && (
        <ImageCropper file={cropFile}
          onDone={f => savePhoto(pendingPhoto.table, pendingPhoto.id, f, null)}
          onCancel={() => { setCropFile(null); setPendingPhoto(null) }} />
      )}

      {/* Tapping an existing photo expands it; Change and Remove live in the viewer */}
      {photoView && (
        <ImageViewer
          value={photoView.item.photoUrl}
          name={photoView.item.name}
          onClose={() => setPhotoView(null)}
          onReplace={f => savePhoto(photoView.table, photoView.item.id, f, photoView.item.photoUrl)}
          onRemove={() => removePhoto(photoView.table, photoView.item.id, photoView.item.photoUrl)} />
      )}

      <div className="shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <face.Icon size={20} style={{ color: '#1D9E75' }} />
          <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{face.title}</p>
          <div className="flex gap-1.5 ml-auto text-[10px] items-center">
            {chips.map(({ text, color }) => (
              <span key={text} className="px-2 py-0.5 rounded-full font-semibold"
                style={{ background: color ? color + '14' : 'var(--c-ghost)', color: color || 'var(--c-muted)' }}>
                {text}
              </span>
            ))}
          </div>
        </div>

        {/* Which animals. The outer dimension of the screen — it re-titles the
            page and swaps the tab set, so it sits above the tabs, not inside one. */}
        <div className="flex gap-1.5 mb-2">
          {GROUPS.map(({ key, label, Icon }) => {
            const n  = livestockMaster.filter(l => isActive(l) && groupOf(l) === key).length
            const on = group === key
            return (
              <button key={key} onClick={() => goTo(tab, key)}
                className="flex-1 py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1 border transition-colors"
                style={{
                  background:  on ? '#1D9E7514' : 'transparent',
                  borderColor: on ? '#1D9E7560' : 'var(--c-border)',
                  color:       on ? '#1D9E75'   : 'var(--c-muted)',
                }}>
                <Icon size={12} />{label}{n > 0 ? ` ${n}` : ''}
              </button>
            )
          })}
        </div>

        <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
          {[
            { key: 'animals', label: face.listTab  },
            { key: 'health',  label: '🩺 Health'   },
            { key: 'finance', label: face.moneyTab },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{ background: tab === key ? '#1D9E75' : 'var(--c-ghost)', color: tab === key ? '#fff' : 'var(--c-muted)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* A checkup that has fallen due is the one thing on this screen worth
            interrupting for, so it sits above the tabs' content wherever you are. */}
        {tab !== 'health' && <CheckupBanner checkups={checkups} onOpen={() => setTab('health')} />}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {tab === 'animals' && (
          <AnimalsTab
            animals={groupActive}
            closed={groupClosed}
            countLogs={livestockCountLogs}
            face={face}
            onEdit={setEditModal}
            onCount={(animal, changeType) => setCountModal({ animal, changeType })}
            onPhoto={handlePhotoClick}
            onAdd={() => setAddModal(true)}
            onClose={setCloseModal} />
        )}
        {tab === 'health'  && <HealthTab animals={groupActive} allAnimals={livestockMaster} face={face} />}
        {tab === 'finance' && <FinanceTab animals={groupAll} face={face} />}
      </div>

      {editModal  && <EditLivestockModal item={editModal} onClose={() => setEditModal(null)} onSave={confirmEdit} saving={saving} />}
      {countModal && <CountModal animal={countModal.animal} changeType={countModal.changeType} onClose={() => setCountModal(null)} onConfirm={confirmCount} saving={saving} />}
      {closeModal && <CloseModal animal={closeModal} onClose={() => setCloseModal(null)} onConfirm={confirmClose} saving={saving} />}
      {addModal   && <AddLivestockModal group={group} onClose={() => setAddModal(false)} onConfirm={confirmAdd} saving={saving} />}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg text-white"
          style={{ background: toast.type === 'error' ? '#E24B4A' : toast.type === 'warn' ? '#BA7517' : '#1D9E75' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
