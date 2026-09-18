// Place lookup for the location pickers.
//
// Photon (photon.komoot.io): OpenStreetMap data, free, no API key, and — the
// reason we are on it — BUILT for type-ahead. Nominatim, which this replaced,
// forbids autocomplete outright in its usage policy and blocks IPs that do it;
// that is why the Location box used to wait until it lost focus before looking
// anything up.
//
// It is a free community service with no uptime guarantee, so every caller must
// survive it failing. Nothing here is the only way to set a location: the map
// takes a tap, and the coordinate boxes take a typed figure.

const ENDPOINT = 'https://photon.komoot.io/api/'

// Photon answers from about three characters; below that the results are noise.
export const MIN_QUERY = 3

// Photon's property bag is loose — a village may carry name+state+country, a
// district name+county+state. Build the label from whatever is there.
//
// Pure, and exported, because the two rules it encodes both came from real
// results: skip blanks, and skip a part that repeats one already used — a city
// whose name equals its county printed "Gurgaon, Gurgaon".
export function formatPlace(props = {}) {
  const out = []
  for (const part of [props?.name, props?.city, props?.county, props?.state, props?.country]) {
    const v = typeof part === 'string' ? part.trim() : ''
    if (!v) continue
    if (out.some(o => o.toLowerCase() === v.toLowerCase())) continue
    out.push(v)
    if (out.length === 4) break      // longer than this stops fitting a phone row
  }
  return out.join(', ')
}

// One GeoJSON feature → the suggestion the dropdown shows, or null if it carries
// no usable coordinate. Photon returns [lng, lat], which is also what MapLibre
// wants, so the order is never flipped on the way through.
export function toSuggestion(feature) {
  const coords = feature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const lng = Number(coords[0])
  const lat = Number(coords[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  const label = formatPlace(feature.properties)
  if (!label) return null
  return { id: `${label}@${lng},${lat}`, label, lng, lat }
}

// Photon really does return the same place twice for some queries — searching
// "gurga" gives two identical "Gurgaon, Haryana, India" rows at one coordinate.
// Two rows that do the same thing is a broken-looking list, so they collapse.
export function suggestionsFrom(json) {
  const seen = new Set()
  const out = []
  for (const feature of json?.features || []) {
    const s = toSuggestion(feature)
    if (!s || seen.has(s.id)) continue
    seen.add(s.id)
    out.push(s)
  }
  return out
}

export async function searchPlaces(query, { limit = 6, signal } = {}) {
  const q = (query || '').trim()
  if (q.length < MIN_QUERY) return []
  const res = await fetch(
    `${ENDPOINT}?q=${encodeURIComponent(q)}&limit=${limit}&lang=en`,
    { signal, headers: { Accept: 'application/json' } },
  )
  if (!res.ok) throw new Error('search failed')
  return suggestionsFrom(await res.json())
}
