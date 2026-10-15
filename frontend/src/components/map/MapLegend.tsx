import type { ReactNode } from 'react'

export interface LegendEntry {
  swatch: string // swatch-* class from index.css
  label: ReactNode
}

// Open by default on wide screens; on a phone the legend would cover much of the small map
const startOpen = () => typeof window === 'undefined' || window.matchMedia('(min-width: 861px)').matches

/** Legend overlay in the corner of a map pane. */
export function MapLegend({ entries, children }: { entries: LegendEntry[]; children?: ReactNode }) {
  return (
    <details className="map-legend" open={startOpen()}>
      <summary>Legend</summary>
      <div className="map-legend-body">
        {entries.map((e, i) => (
          <span className="legend-item" key={i}>
            <span className={`swatch ${e.swatch}`} aria-hidden />
            {e.label}
          </span>
        ))}
        {children}
      </div>
    </details>
  )
}

export function MapHint({ children }: { children: ReactNode }) {
  return <div className="map-hint">{children}</div>
}
