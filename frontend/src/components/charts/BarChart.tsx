import { Fragment, type ReactNode } from 'react'

export interface BarDatum {
  value: number
  /** Value label at the bar's tip. */
  display: string
  /** Categorical slot: 1 (blue) or 2 (orange). */
  series?: 1 | 2
  /** Optional uncertainty interval drawn as a thin whisker, in the same units as value. */
  whisker?: [number, number]
  /** Tooltip shown on hover and keyboard focus (every value is also in the table view). */
  tip: ReactNode
}

export interface BarRow {
  key: string
  label: ReactNode
  bars: BarDatum[]
}

interface BarChartProps {
  rows: BarRow[]
  /** Domain of the value axis; min below 0 draws a zero baseline that bars grow away from. */
  max: number
  min?: number
  label: string
}

const VALUE_SPACE = 56 // px kept free right of the domain for the tip label

/** Horizontal bars on one baseline: thin marks, rounded data-end, value at the tip, tooltip per bar. */
export function BarChart({ rows, max, min = 0, label }: BarChartProps) {
  const lo = Math.min(min, 0)
  const frac = (v: number) => (Math.min(Math.max(v, lo), max) - lo) / (max - lo)
  const at = (f: number, extra = 0) => `calc((100% - ${VALUE_SPACE}px) * ${f} + ${extra}px)`
  const zero = frac(0)

  return (
    <div className="bars" role="list" aria-label={label}>
      {rows.map((row) => (
        <Fragment key={row.key}>
          <div className="bar-label">{row.label}</div>
          <div className="bar-group">
            {row.bars.map((b, i) => {
              const [a, z] = [frac(Math.min(b.value, 0)), frac(Math.max(b.value, 0))]
              return (
                <div className="bar-track" key={i} role="listitem" tabIndex={0}>
                  {lo < 0 && <span className="baseline" style={{ left: at(zero) }} aria-hidden />}
                  <div
                    className={`bar${b.series === 2 ? ' series-2' : ''}${b.value < 0 ? ' negative' : ''}`}
                    style={{ left: at(a), width: `max(2px, ${at(z - a)})` }}
                  />
                  {b.whisker && (
                    <span
                      className="whisker"
                      aria-hidden
                      style={{ left: at(frac(b.whisker[0])), width: at(frac(b.whisker[1]) - frac(b.whisker[0])) }}
                    />
                  )}
                  <span className="bar-value" style={{ left: at(Math.max(z, b.whisker ? frac(b.whisker[1]) : 0), 6) }}>
                    {b.display}
                  </span>
                  <div className="chart-tip" role="tooltip">
                    {b.tip}
                  </div>
                </div>
              )
            })}
          </div>
        </Fragment>
      ))}
    </div>
  )
}
