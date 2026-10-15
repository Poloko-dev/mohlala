import L from 'leaflet'
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useNavigate } from 'react-router'
import type { PoiPoint } from '../../api/client'
import { usePois } from '../../api/queries'
import { useMapColors } from '../../lib/theme'

interface PoiLayerProps {
  /** Existing POIs of this category are drawn on top in the highlight colour; the rest stay grey context. */
  highlight?: string | null
}

/** All 6,083 mapped POIs on one canvas: hover for the name, click for a popup that opens its predictions. */
export function PoiLayer({ highlight = null }: PoiLayerProps) {
  const map = useMap()
  const navigate = useNavigate()
  const { data } = usePois()
  const colors = useMapColors()

  useEffect(() => {
    if (!data) return
    const group = L.layerGroup()
    const ordered = [...data.filter((p) => p.category !== highlight), ...data.filter((p) => p.category === highlight)]
    const markers = ordered.map((p) => {
      const hi = p.category === highlight
      return L.circleMarker([p.lat, p.lon], {
        radius: hi ? 4 : 2.5,
        weight: hi ? 1 : 0,
        color: colors.surface,
        fillColor: hi ? colors.highlight : colors.poi,
        fillOpacity: hi ? 0.95 : 0.55,
        bubblingMouseEvents: false, // a click on a POI must not also pick the location under it
      })
        .bindTooltip(() => text(p.name ?? `${p.category} (unnamed)`), { direction: 'top', offset: [0, -4] })
        .bindPopup(() => popup(p, () => navigate(`/pois/${p.node_id}`)))
        .addTo(group)
    })
    group.addTo(map)
    // Context goes beneath the page's own marks on the shared canvas (grey first, then the highlighted category)
    for (let i = markers.length - 1; i >= 0; i--) markers[i].bringToBack()
    return () => {
      group.remove()
    }
  }, [data, highlight, colors, map, navigate])

  return null
}

// OSM names are untrusted text: build DOM nodes with textContent, never HTML strings
function text(value: string) {
  const span = document.createElement('span')
  span.textContent = value
  return span
}

function popup(p: PoiPoint, open: () => void) {
  const root = document.createElement('div')
  root.className = 'poi-popup'
  const name = document.createElement('strong')
  name.textContent = p.name ?? '(unnamed)'
  const sub = document.createElement('span')
  sub.className = 'sub'
  sub.textContent = `${p.category} · node ${p.node_id}`
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn btn-link'
  button.textContent = 'View model predictions →'
  button.addEventListener('click', open)
  root.append(name, sub, button)
  return root
}
