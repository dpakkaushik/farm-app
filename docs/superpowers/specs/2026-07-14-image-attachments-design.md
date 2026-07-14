# Image Attachments — View, Replace, Crop

**Date:** 2026-07-14
**Status:** Approved, not yet implemented

## Problem

Every place the app attaches an image — bills, receipts, parchis, worker photos, asset
photos, avatars — was built independently. The result:

- **No way to view an attachment in-app.** Every view site is a bare
  `<a href={url} target="_blank">📄</a>` that dumps the raw file into a browser tab.
- **No way to change an image once saved.** Attachments are insert-only.
- **No crop or adjust.** Whatever the camera captured is what gets stored.
- **Twelve implementations of the same thing.** One shared `FilePicker` used in 3 places;
  ~10 other sites hand-roll a raw `<input type="file">` with their own preview markup and
  their own copy of an `uploadFile` helper.

## Requirements

1. Wherever an image is attached, it can be **replaced** — including on already-saved records.
2. Tapping an attached image **expands it** in an in-app viewer.
3. Images can be **cropped and adjusted** — at upload time only.

Explicitly decided: crop belongs to the upload flow. Tapping a saved image only expands it;
re-cropping a saved image is done by replacing it, which re-enters the upload flow.

## Architecture

### `lib/attachments.js` — the storage layer

Replaces ~8 near-identical `uploadFile`/`getPublicUrl` helpers copy-pasted across Harvest,
Labour, Assets, Inventory, Expenses, and Livestock.

```
uploadAttachment(file, { folder, entityId, bucket }) -> { path }
deleteAttachment(path, bucket)                       -> void
resolveUrl(pathOrUrl, bucket)                        -> Promise<string>
pathFromUrl(url)                                     -> string | null
```

**`resolveUrl` is async, and this is load-bearing — see Security below.**

**The database is split on how it stores attachments** and the layer must read both:

| Storage form | Columns |
|---|---|
| Full public URL | `photo_url`, `attachment_url`, `bill_file_url`, `avatar_url` |
| Storage path | `parchi_attachment_path`, `payment_attachment_path`, `attachment_path` (×2) |

`resolveUrl` returns the value as-is if it starts with `http`, otherwise resolves it against
the bucket. `pathFromUrl` recovers a path from a public URL (which always contains
`/object/public/<bucket>/<path>`), so old files can be deleted even where the DB only kept a
URL.

**New writes store paths, not URLs.** A stored URL cannot be deleted, moved behind a signed
URL, or re-bucketed. Existing columns are *not* migrated — nothing here requires it, and a
backfill is its own job.

### Components

**`components/ImageCropper.jsx`** — fullscreen modal. Pinch/drag zoom, rotate 90°, aspect
presets (Free / Square / 4:3). "Skip" keeps the original; "Done" exports the crop to canvas
and compresses it via `browser-image-compression` (already a dependency). Returns a `File`.

**`components/ImageViewer.jsx`** — the lightbox. Fullscreen, dark, pinch and double-tap zoom,
pan, close, download. A PDF falls back to open-in-new-tab. View-only: no edit affordance.

**`components/Attachment.jsx`** — the thumbnail/chip rendered on a *saved* record. Click opens
`ImageViewer`. An optional `onReplace` prop adds a "Change" pencil that re-enters the upload
flow.

**`components/FilePicker.jsx`** (rewrite) — chains them: Camera/Browse → `ImageCropper`
auto-opens for images (PDFs bypass it) → preview with Change and Remove. Tapping the preview
opens `ImageViewer`.

Components take `(path, bucket)` and resolve the display URL **internally and asynchronously**,
with a short-lived in-memory cache. The store stops precomputing public URLs in its transforms.

### Store — one generic replace action

Update actions exist for crops, inventory items, labourers, staff, machinery, assets, and
livestock. There is **no update path at all** for farm expenses, harvest parchis, payment
receipts, labour payment proofs, or inventory purchase bills — they are insert-only.

Rather than write five more bespoke `updateXPhoto` actions, add one:

```
replaceAttachment({ table, id, column, bucket, file, oldPath })
```

It uploads the new object, updates the row, and only then deletes the old one. **Order
matters:** a failure at any step must leave the record pointing at a file that exists. The
reverse order can strand a record pointing at nothing.

## Call sites

| Screen | Column | Bucket | Today |
|---|---|---|---|
| Admin — staff & labourer photo | `photo_url` | farm-photos | `FilePicker` |
| Inventory — purchase bill | `bill_file_url` | farm-photos | `FilePicker` |
| Assets — machinery/asset photo | `photo_url` | farm-photos | raw input |
| Livestock — photo + revenue doc | `photo_url`, `attachment_path` | farm-photos, expense-docs | raw input |
| Expenses — bill/receipt | `attachment_path` | expense-docs | raw input |
| Harvest — weighing slip, parchi | `parchi_attachment_path` | farm-photos | raw input ×2 |
| Harvest — payment receipts | `payment_attachment_path` | farm-photos | raw input ×2 |
| Labour — advance & payment proof | `attachment_url` | farm-photos | raw input |
| Profile — avatar | `avatar_url` | farm-photos | raw input |

Every bare `<a target="_blank">` view link in Dashboard, Harvest, Labour, Expenses, and
Livestock becomes an `<Attachment>` that opens the lightbox in-app.

### Out of scope

- **`Media.jsx`** keeps its own viewer. It already has a working fullscreen gallery with
  prev/next, its own compression, and video thumbnails. Routing it through the generic
  component would be a downgrade.
- **`Field.jsx`** map-overlay upload — a georeferenced raster layer, not an attachment.
- **`Diary.jsx`** — the page is a mockup. No store import, no `supabase` call; it fakes
  success with `setSubmitted(true)`. Its photo input goes nowhere because *the whole form
  goes nowhere*. Wiring the photo means building the diary feature, which is a separate job.

## Security — public buckets

**Every bucket is currently public.** All reads go through `getPublicUrl`, so any farm's
bills, worker photos, and payment receipts are readable by anyone holding the URL, regardless
of farm membership. Table RLS does not protect Storage objects. For a multi-tenant product
whose premise is per-farm isolation, this is a tenant-isolation hole.

The fix is private buckets + signed URLs + Storage RLS policies. The reason it shapes *this*
design rather than waiting for its own:

> `getPublicUrl` is **synchronous**. `createSignedUrl` is **asynchronous**.

Build the components around a sync resolver and the eventual switch becomes a twelve-file
async conversion — the kind of change that never happens. Build them around an **async
resolver from day one**, and the switch is one function in `lib/attachments.js` plus a
migration. That is why `resolveUrl` returns a Promise even though today it has nothing to
await.

Sequenced as the final phase, so images keep working throughout the retrofit and the security
flip lands as an isolated, revertible commit.

## Error handling

Uploads currently fail silently in several places — `Inventory.jsx:73` does `if (!upErr)`
with no `else`, saving a purchase whose bill quietly vanished. The shared layer **throws**,
and pickers surface a visible message rather than persisting a record with a missing file.

## Testing

The repo has no test infrastructure — no runner, no test files, nothing in `package.json`.
Standing up Vitest and Playwright as a side-effect of a UI change is out of scope. Verification
is by driving each retrofitted screen in the browser: pick → crop → save → reopen → expand →
replace.

## Phases

1. `lib/attachments.js` + `replaceAttachment` store action.
2. `ImageCropper`, `ImageViewer`, `Attachment`; rewrite `FilePicker`.
3. Retrofit upload sites (table above).
4. Retrofit view sites — `<a target="_blank">` → `<Attachment>`.
5. Private buckets + signed URLs + Storage RLS migration.

## Dependency

`react-easy-crop` (~15KB gz). Pinch-zoom and drag are built in, which matters because the
manager is one-handed on a phone in a field. Rejected: `cropperjs` (~45KB, desktop-first
touch), and hand-rolling on canvas (~300 lines to lose to a 15KB package).
