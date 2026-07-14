import { supabase } from './supabase'

// Buckets in use. Anything not listed falls back to farm-photos.
export const BUCKETS = { photos: 'farm-photos', docs: 'expense-docs', videos: 'farm-videos' }

export const isPdf = (v) => typeof v === 'string' && v.toLowerCase().includes('.pdf')

// The DB is split: some columns hold a full public URL (photo_url, attachment_url,
// bill_file_url, avatar_url), others hold a storage path (*_attachment_path). Read both.
export function resolveUrl(pathOrUrl, bucket = BUCKETS.photos) {
  if (!pathOrUrl) return null
  // http = already a full URL; blob:/data: = a local preview that isn't in Storage at all.
  if (/^(https?:|blob:|data:)/.test(pathOrUrl)) return pathOrUrl
  return supabase.storage.from(bucket).getPublicUrl(pathOrUrl).data.publicUrl
}

// A Supabase public URL always contains /object/public/<bucket>/<path>, so the path is
// recoverable even where the DB only kept a URL — which is what lets us delete the old file.
export function pathFromUrl(url) {
  if (!url) return null
  if (!url.startsWith('http')) return url
  const m = url.match(/\/object\/public\/[^/]+\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export async function uploadAttachment(file, { folder, entityId, bucket = BUCKETS.photos }) {
  const ext  = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${folder}/${entityId || 'misc'}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

export async function deleteAttachment(pathOrUrl, bucket = BUCKETS.photos) {
  const path = pathFromUrl(pathOrUrl)
  if (!path) return
  await supabase.storage.from(bucket).remove([path])
}
