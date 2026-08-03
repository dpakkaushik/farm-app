// Three pages, one component.
//
// /livestock/pets, /livestock/birds and /livestock/animals are separate pages —
// each opens with its own title, icon, header counts, tab names and money
// treatment. A herd is names that earn, a flock is a number, a pet only ever
// costs, and the owner wanted three doors rather than one door with a switch
// inside it.
//
// They still share this component and the tables underneath, which is what keeps
// the split from costing anything: the Health tab on every page has an "All
// animals" toggle, so the single vet trip that sees the buffalo and the dog is
// one entry from wherever you happen to be; and the farm-wide livestock total
// stays answerable on Ledger → P&L rather than needing all three pages added up.
//
// This file is the shell: URL state, photo plumbing, toast, header, tabs. The
// tabs themselves live in ./livestock/*.
import React, { useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store'
import ImageViewer from '../components/ImageViewer'
import ImageCropper from '../components/ImageCropper'
import { uploadAttachment, deleteAttachment, resolveUrl } from '../lib/attachments'
import HealthTab, { CheckupBanner, pendingCheckups } from './livestock/health'
import AnimalsTab from './livestock/animals'
import FinanceTab from './livestock/finance'
import { AddLivestockModal, EditLivestockModal, CountModal, CloseModal } from './livestock/modals'
import {
  GROUP_KEYS, groupOf, faceOf, isActive, costToDate, animalLabel, fmtK,
} from './livestock/ui'

// Which tabs a page has is a property of the face, declared on GROUPS — the faces
// genuinely diverge, and a pet has no revenue side to show. The URL key is stable
// across faces though ('animals' is the list tab whatever it is called on screen),
// so a bookmark keeps working.
//
// 'finance' is no longer a tab. It was the one that held Revenue and Expenses
// behind a toggle inside itself, and any link made before the split still says it,
// so it resolves to whichever half the face leads with.
const resolveTab = (face, want) => {
  const keys = face.tabs.map(t => t.key)
  if (keys.includes(want)) return want
  if (want === 'finance')  return keys.includes('revenue') ? 'revenue' : 'expenses'
  return 'animals'
}

export default function Livestock() {
  const {
    livestockMaster, livestockCountLogs, livestockHealthLogs, farmExpenses,
    addLivestock, updateLivestock, addLivestockCountLog, addLivestockRevenue,
    closeLivestock, updateAssetPhoto,
  } = useAppStore()

  // The species is the path — it is which page you are on. The tab within the
  // page stays a query param, and switching it replaces rather than pushes: Back
  // should leave the page, not walk its tabs.
  //
  // ?group= is still honoured as a fallback so links made before the split, when
  // all three shared one route, still land on the right page.
  const { group: routeGroup } = useParams()
  const [params, setParams]   = useSearchParams()
  const group = GROUP_KEYS.includes(routeGroup)          ? routeGroup
              : GROUP_KEYS.includes(params.get('group')) ? params.get('group')
              : 'animals'
  const face  = faceOf(group)
  const tab   = resolveTab(face, params.get('tab'))

  // Setting the tab rewrites the whole query string, so a legacy link that carries
  // the group there has to have it written back — otherwise the first tab tap drops
  // ?group=birds and quietly moves you to the herd.
  const keepGroup = routeGroup ? {} : GROUP_KEYS.includes(params.get('group')) ? { group } : {}
  const setTab = t => setParams({ ...keepGroup, ...(t === 'animals' ? {} : { tab: t }) }, { replace: true })

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

        {/* No group switcher here by design. Pets, Birds and Herd are three
            pages reached from the profile menu; listing all three names on each
            of them is what made them read as one shared screen. */}
        {/* Four tabs on a phone need the smaller type to stay on one line each. */}
        <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
          {face.tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 font-semibold whitespace-nowrap transition-colors ${face.tabs.length > 3 ? 'text-[10px]' : 'text-xs'}`}
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
        {tab === 'health' && <HealthTab animals={groupActive} allAnimals={livestockMaster} face={face} />}
        {(tab === 'revenue' || tab === 'expenses') && (
          <FinanceTab animals={groupAll} face={face} mode={tab} />
        )}
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
