import 'leaflet/dist/leaflet.css'
import L, { type LatLngExpression, type LatLngTuple } from 'leaflet'
import { useEffect, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { LESOTHO_BOUNDS, MAX_BOUNDS, roundCoord } from '../../lib/geo'

// OpenStreetMap's standard tiles, muted (and inverted in dark mode) by CSS so the model's marks stand out.
// For production traffic use your own tile provider (VITE_TILE_URL): the OSM servers are for light use only.
const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

interface BaseMapProps {
  children?: ReactNode
  /** Called with the clicked position (rounded to about 1 m) when the user clicks the map. */
  onPick?: (lat: number, lon: number) => void
}

export function BaseMap({ children, onPick }: BaseMapProps) {
  // Every vector layer draws on this one canvas: stacked canvases would hide each other's hover and click events
  const [renderer] = useState(() => L.canvas({ padding: 0.5, tolerance: 4 }))
  return (
    <MapContainer bounds={LESOTHO_BOUNDS} maxBounds={MAX_BOUNDS} minZoom={7} zoomSnap={0.5} renderer={renderer}>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} className="basemap" />
      {onPick && <PickHandler onPick={onPick} />}
      {children}
    </MapContainer>
  )
}

function PickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(roundCoord(e.latlng.lat), roundCoord(e.latlng.lng)) })
  return null
}

/** Moves the map to a position whenever it changes. */
export function FlyTo({ center, zoom = 14 }: { center: LatLngExpression | null; zoom?: number }) {
  const map = useMap()
  const key = center ? JSON.stringify(center) : null
  useEffect(() => {
    if (center) map.flyTo(center, Math.max(map.getZoom(), zoom), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly only when the position itself changes
  }, [key, map])
  return null
}

/** Fits the view to a set of points (a location and its neighbours) whenever they change. */
export function FitTo({ points, maxZoom = 16 }: { points: LatLngTuple[] | null; maxZoom?: number }) {
  const map = useMap()
  const key = points ? JSON.stringify(points) : null
  useEffect(() => {
    if (points?.length) map.flyToBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom, duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit only when the points themselves change
  }, [key, map])
  return null
}

/** Shows the cursor as a crosshair while the map is in "pick a location" mode. */
export function PickCursor() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = 'crosshair'
    return () => {
      el.style.cursor = ''
    }
  }, [map])
  return null
}
