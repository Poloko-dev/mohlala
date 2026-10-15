export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

export const num = (v: number, digits = 2) =>
  v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const int = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })

export const km = (v: number) => `${v.toFixed(1)} km`

export const metres = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v)} m`)

export const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`

export const coords = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`
