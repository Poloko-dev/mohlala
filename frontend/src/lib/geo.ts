import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet'

/** Lesotho's bounding box, as the model checks it (lon_min, lat_min, lon_max, lat_max). */
export const BBOX = { lonMin: 27.0115, latMin: -30.6756, lonMax: 29.4557, latMax: -28.5706 }

export const LESOTHO_BOUNDS: LatLngBoundsExpression = [
  [BBOX.latMin, BBOX.lonMin],
  [BBOX.latMax, BBOX.lonMax],
]

export const MAX_BOUNDS: LatLngBoundsExpression = [
  [BBOX.latMin - 1, BBOX.lonMin - 1.5],
  [BBOX.latMax + 1, BBOX.lonMax + 1.5],
]

export const MASERU: LatLngTuple = [-29.3151, 27.4869]

export const inLesotho = (lat: number, lon: number) =>
  lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax

export const roundCoord = (v: number) => Math.round(v * 1e5) / 1e5

/** A coordinate from a URL search parameter, or null. */
export function coordParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key)
  if (raw === null || raw.trim() === '') return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

/** Corners of the square around a circle, for fitting the map to a search radius. */
export const circleBounds = (lat: number, lon: number, km: number): LatLngTuple[] => {
  const dLat = km / 111.32
  const dLon = dLat / Math.cos((lat * Math.PI) / 180)
  return [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]]
}

/** A location and its 8 graph neighbours, for fitting the map view to a prediction. */
export const neighbourhoodPoints = (p: { lat: number; lon: number; context: { neighbours: { lat: number; lon: number }[] } }) =>
  [[p.lat, p.lon], ...p.context.neighbours.map((n): LatLngTuple => [n.lat, n.lon])] as LatLngTuple[]
