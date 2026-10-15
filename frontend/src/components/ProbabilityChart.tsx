import type { ModePrediction } from '../api/client'
import { num, pct } from '../lib/format'
import { MODE_TEXT } from '../lib/modes'
import { niceMax } from '../lib/scale'
import { BarChart } from './charts/BarChart'
import { DataTable } from './DataTable'

const metric = (v: number | null) => (v === null ? '–' : num(v, 2))

/** Probability of every category in one mode, most likely first (one series, so one colour and no legend). */
export function ProbabilityChart({ prediction, trueCategory }: { prediction: ModePrediction; trueCategory?: string | null }) {
  const { scores, mode } = prediction
  const max = niceMax(scores.map((s) => s.probability))
  const text = MODE_TEXT[mode]
  return (
    <figure className="chart">
      <div className="chart-head">
        <h3>{text.title}</h3>
        <span className="hint">{text.subtitle}</span>
      </div>
      <BarChart
        label={`${text.title}: probability of each category`}
        max={max}
        rows={scores.map((s) => ({
          key: s.category,
          label: (
            <>
              {s.category}
              {s.category === trueCategory && <span className="tag">mapped</span>}
            </>
          ),
          bars: [
            {
              value: s.probability,
              display: pct(s.probability),
              tip: (
                <>
                  <strong>{pct(s.probability, 1)}</strong>
                  {s.category} · {text.title.toLowerCase()}
                  <br />
                  Test F1 {metric(s.test_f1)} · in top 3 for {s.test_top3 === null ? '–' : pct(s.test_top3)} of
                  mapped {s.category}
                </>
              ),
            },
          ],
        }))}
      />
      <details>
        <summary className="hint">Table view and reliability per category</summary>
        <DataTable
          rows={scores}
          rowKey={(s) => s.category}
          columns={[
            { key: 'c', header: 'Category', render: (s) => s.category },
            { key: 'p', header: 'Probability', num: true, render: (s) => pct(s.probability, 1) },
            { key: 'f1', header: 'Test F1', num: true, render: (s) => metric(s.test_f1) },
            { key: 't3', header: 'Top-3 hit', num: true, render: (s) => (s.test_top3 === null ? '–' : pct(s.test_top3)) },
          ]}
        />
      </details>
    </figure>
  )
}
