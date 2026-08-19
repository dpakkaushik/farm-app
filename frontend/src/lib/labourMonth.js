// One month of labour cost — the three figures the Manpower screen reports.
//
// Lifted out of Labour.jsx when the Logs tab was folded into Attendance (the tab
// held one row of cards and an empty list — not a tab's worth of screen). Now
// that the strip renders inside another screen, a pure function is the only way
// the numbers can be guaranteed not to drift from what the Salary tab pays out.
//
// Attendance days arrive already counted, keyed by worker id, with a half day
// worth 0.5 — see the loader in Labour.jsx.

// Day rate is spread over working days only (month days minus the paid holiday
// allowance). Full presence across those working days earns the full salary;
// salary never exceeds that cap.
export function calcStaffEarned(daysPresent, daysInMonth, monthlySalary, monthlyHoliday = 2) {
  if (!monthlySalary) return 0
  const workingDays = Math.max(1, daysInMonth - monthlyHoliday)
  const dailyRate   = monthlySalary / workingDays
  return Math.min(monthlySalary, Math.round(daysPresent * dailyRate))
}

// 'YYYY-MM' → its parts as numbers. Built by hand rather than `new Date(month)`,
// which parses as UTC and lands on the previous month west of Greenwich.
function partsOf(month) {
  const [y, m] = String(month || '').split('-').map(Number)
  return { y, m }
}

export function daysInMonth(month) {
  const { y, m } = partsOf(month)
  if (!y || !m) return 30
  return new Date(y, m, 0).getDate()
}

// '2026-08' → 'August 2026', for a heading that names the month being shown.
export function monthLabel(month) {
  const { y, m } = partsOf(month)
  if (!y || !m) return ''
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

// The logs belonging to one month. `date` is a 'YYYY-MM-DD' string, so the
// prefix match is the whole test — no parsing, no timezone to get wrong.
export function logsInMonth(labourLogs = [], month) {
  return labourLogs.filter(l => l.date?.startsWith(month))
}

/**
 * @param {object} p
 * @param {Array}  p.permanentStaff    salaried staff (monthlySalary set) or day-rate staff
 * @param {Array}  p.regularLabourers  the farm's own labourers, paid by attendance
 * @param {Array}  p.labourLogs        every log; narrowed to `month` here
 * @param {string} p.month             'YYYY-MM'
 * @param {object} p.attDays           { [workerId]: days present, half days as 0.5 }
 * @returns {{staffSalary:number, regularTotal:number, contractualTotal:number, total:number}}
 */
export function monthlyLabourSummary({
  permanentStaff = [], regularLabourers = [], labourLogs = [], month, attDays = {},
}) {
  const dim  = daysInMonth(month)
  const logs = logsInMonth(labourLogs, month)

  // Staff salary: the full monthly figure, less absences beyond the allowance.
  const staffSalary = permanentStaff.reduce((sum, s) => {
    const days = attDays[s.id] || 0
    return sum + (s.monthlySalary
      ? calcStaffEarned(days, dim, s.monthlySalary, s.monthlyHoliday)
      : Math.round(days * (s.ratePerDay || 0)))
  }, 0)

  // A regular labourer earns two ways: their attendance, and any log naming them.
  const regularAttPay = regularLabourers.reduce(
    (sum, l) => sum + Math.round((attDays[l.id] || 0) * (l.ratePerDay || 0)), 0)
  const regularLogPay = logs
    .filter(l => l.labourMasterId && regularLabourers.some(r => r.id === l.labourMasterId))
    .reduce((sum, l) => sum + (l.totalCost || 0), 0)
  const regularTotal = regularAttPay + regularLogPay

  // A log with no master id is a pure daily hire, on nobody's roll.
  const contractualTotal = logs
    .filter(l => !l.labourMasterId)
    .reduce((sum, l) => sum + (l.totalCost || 0), 0)

  return {
    staffSalary,
    regularTotal,
    contractualTotal,
    total: staffSalary + regularTotal + contractualTotal,
  }
}
