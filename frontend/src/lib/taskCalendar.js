// Pure logic behind the bell's task calendar — the month grid, the crop-colour
// assignment and the per-date dots. The component (pages/today/TaskCalendar.jsx)
// only renders what these return, so everything date-shaped is testable here.
//
// Date strings throughout are local 'YYYY-MM-DD' (months 'YYYY-MM'), compared
// lexically — never via toISOString(), whose UTC shift has bitten this app
// before (see lib/period.js).

// Crops have no colour column in the database. Colours are assigned here from a
// fixed palette by the crop's alphabetical rank among the names present —
// deterministic across sessions, and guaranteed distinct while a farm grows
// fewer crops than the palette holds. If the owner ever wants to pick colours,
// that becomes a column on `crops` and this map reads it first.
export const CROP_PALETTE = [
  '#1D9E75', // teal — the app's own green
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#ec4899', // pink
  '#0ea5e9', // sky
  '#a855f7', // violet
  '#84cc16', // lime
  '#f97316', // orange
]

// Overdue is always this red, whatever the crop — the date being missed matters
// more than which crop missed it.
export const OVERDUE_RED = '#E24B4A'

const pad2 = n => String(n).padStart(2, '0')
const toStr = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`

export const monthOf = dateStr => dateStr.slice(0, 7)

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

export function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`
}

export function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`
}

// Sunday-first calendar grid: an array of weeks, each week seven cells of
// { dateStr, inMonth }. Padding days come from the neighbouring months so every
// row is full — the component dims them.
export function buildMonthGrid(ym) {
  const [y, m] = ym.split('-').map(Number)
  // new Date(y, m-1, 1) is local — safe, unlike parsing a string.
  const firstDow    = new Date(y, m - 1, 1).getDay()      // 0 = Sunday
  const daysInMonth = new Date(y, m, 0).getDate()

  // Walk from the Sunday on/before the 1st to the Saturday on/after the last.
  const cells = []
  const cursor = new Date(y, m - 1, 1 - firstDow)
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7
  for (let i = 0; i < totalCells; i++) {
    cells.push({
      dateStr: toStr(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()),
      inMonth: cursor.getMonth() === m - 1,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function cropColorMap(names) {
  const unique = [...new Set(names)].sort()
  const map = {}
  unique.forEach((name, i) => { map[name] = CROP_PALETTE[i % CROP_PALETTE.length] })
  return map
}

export function groupTasksByDate(tasks) {
  const byDate = {}
  tasks.forEach(t => {
    byDate[t.dateStr] = byDate[t.dateStr] ? [...byDate[t.dateStr], t] : [t]
  })
  return byDate
}

const MAX_DOTS = 3

// The dots under a date number. A past date collapses to one red dot — "you
// missed something here" is the whole message; which crops comes on tap. Today
// and future dates get one dot per crop, capped so a busy day stays legible.
export function dateDots(tasks, dateStr, todayStr, colorMap) {
  if (!tasks || tasks.length === 0) return []
  if (dateStr < todayStr) return [OVERDUE_RED]
  const seen = []
  for (const t of tasks) {
    const color = colorMap[t.cropName]
    if (color && !seen.includes(color)) seen.push(color)
    if (seen.length === MAX_DOTS) break
  }
  return seen
}
