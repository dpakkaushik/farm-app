import { useEffect, useRef, useState } from 'react'
import { searchPlaces, MIN_QUERY } from '../lib/geocode'

// A text box that suggests places as you type, and hands back a coordinate when
// one is chosen. Replaces the old "Find" button: a button made you commit to a
// spelling and then guess whether the map had moved.
//
// The text belongs to the parent — on the farm form it is also the farm's stored
// location, so it stays whatever was typed, suggestion or not.
const DEBOUNCE_MS = 350

export default function PlaceSearch({
  value,
  onChange,                 // (text) => void
  onPick,                   // ({ label, lat, lng }) => void
  placeholder = 'Search a village, town or district…',
  style,
}) {
  const [list,   setList]   = useState([])
  const [open,   setOpen]   = useState(false)
  const [busy,   setBusy]   = useState(false)
  const [msg,    setMsg]    = useState('')
  const [active, setActive] = useState(-1)

  const box      = useRef(null)
  const abort    = useRef(null)
  const lastQ    = useRef('')
  // Set when a suggestion is taken, so the text change it causes does not fire a
  // fresh search for the label we just inserted.
  const justPicked = useRef(false)

  // ── Debounced lookup ───────────────────────────────────────────────────────
  useEffect(() => {
    const q = (value || '').trim()
    if (justPicked.current) { justPicked.current = false; lastQ.current = q; return }
    if (q === lastQ.current) return
    if (q.length < MIN_QUERY) { setList([]); setOpen(false); setMsg(''); return }

    const timer = setTimeout(async () => {
      lastQ.current = q
      abort.current?.abort()
      const ctl = new AbortController()
      abort.current = ctl
      setBusy(true); setMsg('')
      try {
        const hits = await searchPlaces(q, { signal: ctl.signal })
        if (ctl.signal.aborted) return
        setList(hits)
        setActive(-1)
        setOpen(true)
        // Not an error — the place may simply not be in OpenStreetMap, and the
        // map and the coordinate boxes are still open to them.
        if (!hits.length) setMsg(`No match for "${q}" — tap it on the map instead.`)
      } catch (err) {
        if (err?.name === 'AbortError') return
        setList([]); setOpen(false)
        setMsg('Search is unavailable — tap the map, or type the coordinates.')
      } finally {
        if (!ctl.signal.aborted) setBusy(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [value])

  // Close when the tap lands outside.
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('touchstart', away)
    }
  }, [])

  useEffect(() => () => abort.current?.abort(), [])

  const take = (hit) => {
    justPicked.current = true
    onChange?.(hit.label)
    onPick?.(hit)
    setOpen(false)
    setList([])
    setMsg('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    // Enter inside a form would submit it — while a suggestion is highlighted
    // that would create the farm instead of choosing the place.
    if (e.key === 'Enter' && open && list.length) {
      e.preventDefault()
      take(list[active >= 0 ? active : 0])
      return
    }
    if (!open || !list.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % list.length) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => (i <= 0 ? list.length : i) - 1) }
  }

  return (
    <div ref={box} style={{ position: 'relative', ...style }}>
      <input
        value={value || ''}
        onChange={e => onChange?.(e.target.value)}
        onFocus={() => { if (list.length) setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        style={input}
      />
      {busy && <span style={spinner}>…</span>}

      {open && list.length > 0 && (
        <ul style={menu}>
          {list.map((hit, i) => (
            <li key={hit.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                // mousedown, not click: the input's blur would close the list first
                onMouseDown={e => { e.preventDefault(); take(hit) }}
                style={row(i === active)}
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && <p style={note}>{msg}</p>}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const input = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--c-border-md)',
  borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
  background: 'var(--c-input)', color: 'var(--c-text)', outline: 'none',
}
const spinner = {
  position: 'absolute', right: '10px', top: '10px',
  fontSize: '14px', color: 'var(--c-muted)', pointerEvents: 'none',
}
const menu = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
  margin: 0, padding: '4px', listStyle: 'none',
  background: 'var(--c-surface)', border: '1px solid var(--c-border-md)',
  borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  maxHeight: '210px', overflowY: 'auto',
}
const row = (on) => ({
  display: 'block', width: '100%', textAlign: 'left',
  padding: '9px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
  background: on ? 'var(--c-ghost)' : 'transparent',
  color: 'var(--c-text)', fontSize: '13px', lineHeight: 1.35,
})
const note = { margin: '6px 0 0', fontSize: '12px', color: 'var(--c-muted)' }
