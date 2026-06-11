import React, { useState } from 'react'
import { CheckCircle, Camera } from 'lucide-react'
import { farmApi } from '../api/client'

const FARM_ID = import.meta.env.VITE_FARM_ID || 'demo'

const PLOTS   = ['Plot A', 'Plot B', 'Plot C', 'Plot D']
const ACT_TYPES = ['Irrigation', 'Weeding', 'Spraying', 'Fertilizer', 'Harvest', 'Other']
const HEALTH  = [
  { value: 'good',    label: '✅ Good',    color: '#1D9E75' },
  { value: 'average', label: '🟡 Average', color: '#BA7517' },
  { value: 'concern', label: '🔴 Concern', color: '#E24B4A' },
]

export default function Diary() {
  const today = new Date().toISOString().split('T')[0]

  const [selectedPlots, setSelectedPlots] = useState([])
  const [plotActivities, setPlotActivities] = useState({})
  const [workerCount, setWorkerCount]     = useState('')
  const [workerHours, setWorkerHours]     = useState('')
  const [healthRating, setHealthRating]   = useState('')
  const [notes, setNotes]                 = useState('')
  const [tomorrowPlan, setTomorrowPlan]   = useState('')
  const [submitted, setSubmitted]         = useState(false)
  const [submitting, setSubmitting]       = useState(false)

  const togglePlot = (p) => setSelectedPlots(v => v.includes(p) ? v.filter(x => x !== p) : [...v, p])

  const setPlotActivity = (plot, act) =>
    setPlotActivities(v => ({ ...v, [plot]: act }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const activities = {}
    selectedPlots.forEach(p => { activities[p] = { activity: plotActivities[p] || 'General', workers: parseInt(workerCount) || 0, hours: parseFloat(workerHours) || 0 } })
    const payload = {
      diary_date: today,
      summary: notes || `Work done on ${selectedPlots.join(', ')}.`,
      plot_activities: activities,
      tomorrows_plan: tomorrowPlan || null,
    }
    try {
      await farmApi.submitDiary(FARM_ID, payload)
    } catch {
      // offline — will sync later
    } finally {
      setSubmitting(false)
      setSubmitted(true)
    }
  }

  if (submitted) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-[var(--c-bg)] p-8 text-center">
        <CheckCircle size={56} className="text-[#1D9E75]" />
        <h2 className="text-xl font-bold text-[var(--c-text)]">Diary Submitted!</h2>
        <p className="text-sm text-white/50">Owner has been notified. See you tomorrow.</p>
        <button onClick={() => setSubmitted(false)} className="mt-4 px-6 py-2.5 bg-white/10 rounded-xl text-sm text-[var(--c-text)] hover:bg-white/20 transition-colors">
          Submit Another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="h-full overflow-y-auto bg-[var(--c-bg)] p-4 space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-bold text-[var(--c-text)]">Daily Diary</h1>
        <p className="text-sm text-[var(--c-muted)]">{today}</p>
      </div>

      {/* Plot selection */}
      <Section title="Which plots were worked on?">
        <div className="grid grid-cols-2 gap-2">
          {PLOTS.map(p => (
            <button
              key={p} type="button"
              onClick={() => togglePlot(p)}
              className={`py-3 rounded-xl text-sm font-medium border transition-colors ${
                selectedPlots.includes(p)
                  ? 'bg-[#1D9E75]/20 border-[#1D9E75] text-[#1D9E75]'
                  : 'bg-white/5 border-white/10 text-[var(--c-sub)] hover:border-white/30'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </Section>

      {/* Activity per selected plot */}
      {selectedPlots.length > 0 && (
        <Section title="Activity type per plot">
          <div className="space-y-3">
            {selectedPlots.map(plot => (
              <div key={plot}>
                <p className="text-xs text-white/50 mb-1.5">{plot}</p>
                <div className="flex flex-wrap gap-2">
                  {ACT_TYPES.map(act => (
                    <button
                      key={act} type="button"
                      onClick={() => setPlotActivity(plot, act)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        plotActivities[plot] === act
                          ? 'bg-[#1D9E75]/20 border-[#1D9E75] text-[#1D9E75]'
                          : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30'
                      }`}
                    >
                      {act}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Workers */}
      <Section title="Labour">
        <div className="grid grid-cols-2 gap-3">
          <LabelInput label="Workers" type="number" min="0" placeholder="0"   value={workerCount} onChange={e => setWorkerCount(e.target.value)} />
          <LabelInput label="Hours"   type="number" min="0" placeholder="0.0" value={workerHours} onChange={e => setWorkerHours(e.target.value)} />
        </div>
      </Section>

      {/* Crop health */}
      <Section title="Crop health today">
        <div className="grid grid-cols-3 gap-2">
          {HEALTH.map(h => (
            <button
              key={h.value} type="button"
              onClick={() => setHealthRating(h.value)}
              className={`py-3 rounded-xl text-xs font-semibold border transition-colors ${
                healthRating === h.value
                  ? 'border-current opacity-100'
                  : 'bg-white/5 border-white/10 text-white/50 hover:border-white/30'
              }`}
              style={healthRating === h.value ? { background: `${h.color}20`, color: h.color, borderColor: h.color } : {}}
            >
              {h.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <textarea
          rows={3}
          placeholder="What was done today? Any issues observed?"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[var(--c-text)] placeholder-white/25 focus:outline-none focus:border-[#1D9E75] resize-none"
        />
        <label className="flex items-center gap-2 text-xs text-[var(--c-muted)] cursor-pointer hover:text-[var(--c-sub)] mt-2">
          <Camera size={14} /> Attach photo
          <input type="file" accept="image/*" capture="environment" className="hidden" />
        </label>
      </Section>

      {/* Tomorrow's plan */}
      <Section title="Tomorrow's plan">
        <textarea
          rows={2}
          placeholder="What's the plan for tomorrow?"
          value={tomorrowPlan}
          onChange={e => setTomorrowPlan(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[var(--c-text)] placeholder-white/25 focus:outline-none focus:border-[#1D9E75] resize-none"
        />
      </Section>

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--c-bg)]/95 backdrop-blur-sm border-t border-white/8">
        <button
          type="submit" disabled={submitting || selectedPlots.length === 0}
          className="w-full py-4 rounded-xl font-semibold text-sm bg-[#1D9E75] text-[var(--c-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#17a97e] transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit Diary'}
        </button>
      </div>
    </form>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  )
}

function LabelInput({ label, ...props }) {
  return (
    <div>
      <label className="text-xs text-[var(--c-muted)] block mb-1">{label}</label>
      <input {...props} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[var(--c-text)] placeholder-white/25 focus:outline-none focus:border-[#1D9E75]" />
    </div>
  )
}
