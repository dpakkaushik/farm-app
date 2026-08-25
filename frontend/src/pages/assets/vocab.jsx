// The register's shared vocabulary — status colours and the emoji that stands in
// for a machine or an asset until it has a photo. Lives here so the list cards,
// the detail sheet and the forms all read the same table.

export const STATUS_STYLE = {
  in_use:       { bg: '#8A9A5B18', color: '#8A9A5B', label: 'In Use'   },
  spare:        { bg: '#4169E118', color: '#4169E1', label: 'Spare'    },
  under_repair: { bg: '#BA751718', color: '#BA7517', label: 'Repair'   },
  disposed:     { bg: '#88888820', color: '#888',    label: 'Disposed' },
  sold:         { bg: '#88888820', color: '#888',    label: 'Sold'     },
}

export const CAT_EMOJI = {
  equipment: '🛢', appliance: '🔌', furniture: '🪑',
  tractor: '🚜', implement: '🔩', generator: '⚡', engine: '⚙️', trailer: '🚛',
  sprayer: '💧', water_motor: '💧', grass_cutter: '🌿', wood_cutter: '🪚',
  vehicle: '🏍', other: '📦',
}

export function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.in_use
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}
