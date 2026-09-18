// A plot row stores its boundary as eight flat columns — point_a_lat … point_d_lng
// (migration 0010_add_four_gps_points_to_plots). MapPicker speaks [{lat,lng}, …].
// These convert between the two, and the round trip has to be lossless: a corner
// that shifts on save redraws the plot somewhere it isn't.

export const CORNER_KEYS = ['a', 'b', 'c', 'd']

// Read the columns as a PREFIX — stop at the first corner that is not a real
// pair — rather than filtering out the blanks. With A empty and B set, filtering
// would slide B's coordinates into A's slot and silently reshape the plot.
export function cornersFromPlot(row = {}) {
  const out = []
  for (const k of CORNER_KEYS) {
    const lat = parseFloat(row?.[`point_${k}_lat`])
    const lng = parseFloat(row?.[`point_${k}_lng`])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) break
    out.push({ lat, lng })
  }
  return out
}

// The patch is spread over the whole form, so corners the user removed must come
// back as '' — leaving them out would strand the previous shape's coordinates.
export function plotFromCorners(points = []) {
  const patch = {}
  CORNER_KEYS.forEach((k, i) => {
    const p = points?.[i]
    patch[`point_${k}_lat`] = p ? String(p.lat) : ''
    patch[`point_${k}_lng`] = p ? String(p.lng) : ''
  })
  return patch
}
