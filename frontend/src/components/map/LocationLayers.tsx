import { Circle, CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import type { Neighbour } from '../../api/client'
import { metres } from '../../lib/format'
import { useMapColors } from '../../lib/theme'

/** The analysed location, with the 500 m and 2 km rings the context counts POIs in. */
export function LocationMarker({ lat, lon, rings = true }: { lat: number; lon: number; rings?: boolean }) {
  const c = useMapColors()
  return (
    <>
      {rings && (
        <>
          <Circle center={[lat, lon]} radius={2000} pathOptions={{ color: c.ink2, weight: 1, opacity: 0.5, fill: false }} interactive={false} />
          <Circle center={[lat, lon]} radius={500} pathOptions={{ color: c.ink2, weight: 1, opacity: 0.7, fill: false }} interactive={false} />
        </>
      )}
      <CircleMarker center={[lat, lon]} radius={12} pathOptions={{ color: c.ink2, weight: 1.5, fill: false }} interactive={false} />
      <CircleMarker center={[lat, lon]} radius={7} pathOptions={{ color: c.surface, weight: 2, fillColor: c.site, fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -10]}>
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </Tooltip>
      </CircleMarker>
    </>
  )
}

/** Links from the location to its 8 nearest mapped POIs: its neighbours in the model's graph. */
export function NeighbourLinks({ lat, lon, neighbours }: { lat: number; lon: number; neighbours: Neighbour[] }) {
  const c = useMapColors()
  return (
    <>
      {neighbours.map((n) => (
        <Polyline
          key={`l${n.node_id}`}
          positions={[[lat, lon], [n.lat, n.lon]]}
          pathOptions={{ color: c.ink2, weight: 1.5, opacity: 0.7 }}
          interactive={false}
        />
      ))}
      {neighbours.map((n) => (
        <CircleMarker
          key={`n${n.node_id}`}
          center={[n.lat, n.lon]}
          radius={5}
          pathOptions={{ color: c.ink2, weight: 2, fillColor: c.surface, fillOpacity: 1 }}
          bubblingMouseEvents={false}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <strong>{n.name ?? '(unnamed)'}</strong>
            <br />
            {n.category} · {metres(n.distance_m)}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
