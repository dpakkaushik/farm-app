// Weather, in the two forms the app shows it: an emoji and a word.
//
// WMO weather codes, as returned by Open-Meteo (open-meteo.com/en/docs) — the
// service needs no key, which is why it is used. The farm's coordinates are
// fixed here: there is no lat/long column on `farms`, and every screen that
// shows weather shows THIS farm's. When a farm gets coordinates of its own,
// this is the one place to read them from.
export const FARM_LAT = 28.5073
export const FARM_LON = 80.4863

export const forecastUrl = (lat = FARM_LAT, lon = FARM_LON) =>
  'https://api.open-meteo.com/v1/forecast'
  + `?latitude=${lat}&longitude=${lon}`
  + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  + '&timezone=Asia/Kolkata&forecast_days=7'

export function weatherEmoji(code) {
  if (code === 0)  return '☀️'
  if (code <= 2)   return '🌤️'
  if (code <= 3)   return '☁️'
  if (code <= 48)  return '🌫️'
  if (code <= 57)  return '🌦️'
  if (code <= 65)  return '🌧️'
  if (code <= 77)  return '🌨️'
  if (code <= 82)  return '🌦️'
  return '⛈️'
}

export function weatherCondition(code) {
  if (code === 0)  return 'Clear Sky'
  if (code <= 2)   return 'Partly Cloudy'
  if (code === 3)  return 'Overcast'
  if (code <= 48)  return 'Foggy'
  if (code <= 57)  return 'Drizzle'
  if (code <= 65)  return 'Rainy'
  if (code <= 82)  return 'Showers'
  return 'Thunderstorm'
}

// "☀️ 34° · Clear Sky" — the one-line form the Today header carries.
export function weatherLine(current) {
  if (!current) return null
  return `${weatherEmoji(current.weather_code)} ${Math.round(current.temperature_2m)}° · ${weatherCondition(current.weather_code)}`
}
