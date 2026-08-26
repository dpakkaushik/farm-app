import { useEffect, useState } from 'react'
import { forecastUrl } from '../lib/weather'

// The farm's weather, fetched once per mount: { current, daily }. Both null
// until it lands, and both stay null if the call fails — weather is decoration
// on every screen that shows it, so a failure must never break the page.
//
// Two screens read it (the Field map's pill, the Today header's line), which is
// why it is a hook rather than two copies of the same fetch.
export default function useWeather() {
  const [data, setData] = useState({ current: null, daily: null })

  useEffect(() => {
    let cancelled = false
    fetch(forecastUrl())
      .then(r => r.json())
      .then(d => { if (!cancelled) setData({ current: d.current, daily: d.daily }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return data
}
