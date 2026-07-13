// Tree dots for the field map.
//
// Nobody has walked the farm with a GPS, and they should not have to. A planting
// already knows its species (colour), its count, and its location -- a plot, a
// plot's boundary sides, or just "on a boundary somewhere". That is enough to
// draw dots.
//
// THESE DOTS ARE NOT A SURVEY. They say "17 mangoes are along this boundary",
// never "this mango is here". Field.jsx renders them small and translucent, so
// they read as texture (the way hatching reads as "forest" on a survey map)
// rather than as pins, which would imply a precision that does not exist.
//
// If a planting ever gets real surveyed coordinates in geo_points, they are used
// verbatim and none of this runs.

const FRUIT_COLOR  = '#4ADE80'
const TIMBER_COLOR = '#C08B4A'

// Deterministic RNG. Positions are seeded from the planting id, so a dot lands in
// the same place on every render -- dots that jitter when you pan look broken.
function seedFrom(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rngFrom(id) {
  let a = seedFrom(id)
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ringOf(geoPolygon) {
  const g = geoPolygon?.geometry || geoPolygon
  const ring = g?.coordinates?.[0]
  return Array.isArray(ring) && ring.length >= 4 ? ring : null
}

function centroidOf(ring) {
  const n = ring.length - 1
  let x = 0, y = 0
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1] }
  return [x / n, y / n]
}

function inside(ring, lng, lat) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

// Scatter n points inside a polygon by rejection sampling on its bounding box.
function scatterInside(ring, n, rand) {
  const lngs = ring.map(c => c[0]), lats = ring.map(c => c[1])
  const [minX, maxX] = [Math.min(...lngs), Math.max(...lngs)]
  const [minY, maxY] = [Math.min(...lats), Math.max(...lats)]
  const out = []
  let guard = n * 40
  while (out.length < n && guard-- > 0) {
    const lng = minX + rand() * (maxX - minX)
    const lat = minY + rand() * (maxY - minY)
    if (inside(ring, lng, lat)) out.push([lng, lat])
  }
  return out
}

// Space n points along a path, nudged sideways a little so they read as a planted
// line rather than a ruler.
function spaceAlong(path, n, rand) {
  if (path.length < 2 || n < 1) return []
  const segs = []
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1])
    segs.push({ a: path[i], b: path[i + 1], d })
    total += d
  }
  if (total === 0) return []

  const jitter = total / (n * 6 + 1)
  const out = []
  for (let k = 0; k < n; k++) {
    let target = ((k + 0.5) / n) * total
    for (const { a, b, d } of segs) {
      if (target > d) { target -= d; continue }
      const t = d === 0 ? 0 : target / d
      out.push([
        a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * jitter,
        a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * jitter,
      ])
      break
    }
  }
  return out
}

// Which edges of a plot face north / east / south / west, judged by where each
// edge's midpoint sits relative to the plot's centre. A plot is a rough
// quadrilateral, so this is good enough to put trees on the right side of it.
function edgesFacing(ring, sides) {
  const [cx, cy] = centroidOf(ring)
  const want = new Set(sides)
  const picked = []
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1]
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    const dx = mx - cx, dy = my - cy
    const face = Math.abs(dy) >= Math.abs(dx)
      ? (dy >= 0 ? 'north' : 'south')
      : (dx >= 0 ? 'east'  : 'west')
    if (want.has(face)) picked.push([a, b])
  }
  return picked
}

/**
 * Build the tree-dot FeatureCollection.
 *
 * @param {object[]} plantings   from the tree store
 * @param {object[]} species     from the tree store
 * @param {Record<string, object>} plotPolygons  plotId -> GeoJSON polygon Feature
 * @param {number[][]} farmBoundary  the farm's outer ring, for boundary trees
 *                                   whose exact spot the manager has not set yet
 */
export function buildTreeDots(plantings, species, plotPolygons, farmBoundary) {
  const speciesById = Object.fromEntries(species.map(s => [s.id, s]))
  const features = []

  for (const p of plantings) {
    const sp = speciesById[p.speciesId]
    if (!sp || p.count < 1) continue

    const rand  = rngFrom(p.id)
    const ring  = p.plotId ? ringOf(plotPolygons[p.plotId]) : null
    let coords  = []
    let precise = false

    if (p.geoPoints?.length) {
      // Somebody actually surveyed these. Use what they measured.
      coords  = p.geoPoints
      precise = true
    } else if (p.locationType === 'plot' && ring) {
      coords = scatterInside(ring, p.count, rand)
    } else if (p.locationType === 'boundary' && ring && p.boundarySides?.length) {
      const edges = edgesFacing(ring, p.boundarySides)
      if (edges.length) {
        const per = Math.ceil(p.count / edges.length)
        edges.forEach(([a, b], i) => {
          const n = Math.min(per, p.count - i * per)
          if (n > 0) coords.push(...spaceAlong([a, b], n, rand))
        })
      } else {
        coords = spaceAlong(ring, p.count, rand)
      }
    } else if (p.locationType === 'boundary' && ring) {
      // Right plot, but nobody has said which side yet -- ring it.
      coords = spaceAlong(ring, p.count, rand)
    } else if (p.locationType === 'boundary' && farmBoundary?.length) {
      // All we know is "on a boundary". That is true, and it is where the farm's
      // perimeter is -- so draw them there rather than invent a plot. When the
      // manager tags the real spot, they move.
      coords = spaceAlong(farmBoundary, p.count, rand)
    }

    for (const c of coords) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: {
          name:    sp.nameLocal,
          purpose: sp.purpose,
          color:   sp.purpose === 'timber' ? TIMBER_COLOR : FRUIT_COLOR,
          precise,
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}
