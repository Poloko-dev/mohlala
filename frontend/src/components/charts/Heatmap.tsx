import { signed } from '../../lib/format'

interface HeatmapProps {
  rowHeader: string
  rows: string[]
  cols: string[]
  values: number[][]
  unit: string
}

/** Diverging heatmap as a table: blue raises, red lowers, grey is no change. Values are printed in each cell. */
export function Heatmap({ rowHeader, rows, cols, values, unit }: HeatmapProps) {
  const max = Math.max(...values.flat().map(Math.abs), 1e-9)
  const fill = (v: number) => {
    const share = Math.round((Math.min(Math.abs(v) / max, 1) * 80) / 5) * 5 // at most 80%, so the ink stays legible
    return `color-mix(in oklab, var(${v >= 0 ? '--div-pos' : '--div-neg'}) ${share}%, var(--div-mid))`
  }
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table heatmap">
          <thead>
            <tr>
              <th scope="col">{rowHeader}</th>
              {cols.map((c) => (
                <th key={c} scope="col" className="num">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r}>
                <th scope="row">{r}</th>
                {values[i].map((v, j) => (
                  <td key={cols[j]} className="cell" style={{ background: fill(v) }}
                      title={`${r} neighbours → ${cols[j]}: ${signed(v, 2)} ${unit}`}>
                    {signed(v, 2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="scale" aria-hidden>
        <span>{signed(-max, 1)}</span>
        <span className="scale-bar"
              style={{ background: 'linear-gradient(to right, var(--div-neg), var(--div-mid), var(--div-pos))' }} />
        <span>{signed(max, 1)} {unit}</span>
      </div>
    </div>
  )
}
