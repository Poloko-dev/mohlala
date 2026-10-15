import type { ReactNode } from 'react'
import type { ModelInfo } from '../api/client'
import { useModelInfo } from '../api/queries'
import { BarChart } from '../components/charts/BarChart'
import { Heatmap } from '../components/charts/Heatmap'
import { DataTable } from '../components/DataTable'
import { ErrorAlert, StatTile } from '../components/Feedback'
import { int, num, pct, signed } from '../lib/format'
import { MODE_TEXT } from '../lib/modes'
import { niceMax } from '../lib/scale'

type Table = ModelInfo['ablations']
type Cell = Table[number][string]

const GROUP_NAMES: Record<string, string> = {
  'group: loc_': 'Location and density (loc_)',
  'group: struct_': 'Graph structure (struct_)',
  'group: adm_': 'Administrative area (adm_)',
  'group: ctx_': 'Mapping profile of the 32 nearest POIs (ctx_)',
  'neighbour categories': 'Categories of the neighbours',
}

const fmt = (v: Cell, digits = 3): ReactNode =>
  typeof v === 'number' ? (Number.isInteger(v) ? int(v) : num(v, digits)) : v === null || v === undefined ? '—' : String(v)

/** A table of metrics.json records with chosen columns. */
function RecordTable({ rows, columns }: { rows: Table; columns: [key: string, header: string][] }) {
  return (
    <DataTable<Table[number]>
      rows={rows}
      rowKey={(r) => JSON.stringify(r)}
      columns={columns.map(([key, header]) => ({
        key,
        header,
        num: typeof rows[0]?.[key] === 'number',
        render: (r) => fmt(r[key]),
      }))}
    />
  )
}

function Legend({ items }: { items: [cls: string, label: string][] }) {
  return (
    <div className="legend">
      {items.map(([cls, label]) => (
        <span className="legend-item" key={label}>
          <span className="legend-rect" style={{ background: `var(${cls})` }} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  )
}

/** The model: how well it does (RO1, RO4) and what drives its predictions (RO2), from metrics.json. */
export function ModelPage() {
  const { data: m, error, isPending } = useModelInfo()
  if (isPending) return <div className="page"><p className="hint">Loading the model description…</p></div>
  if (!m) return <div className="page"><ErrorAlert error={error} /></div>

  const perClass = m.per_class.known.map((k) => ({ known: k, site: m.per_class.site.find((s) => s.category === k.category)! }))
  const groups = m.permutation_importance.filter((r) => r.unit in GROUP_NAMES)
  const singles = m.permutation_importance.filter((r) => !(r.unit in GROUP_NAMES)).slice(0, 15)
  const infl = m.neighbour_influence

  return (
    <div className="page">
      <header className="page-header">
        <h1>The model</h1>
        <p className="lead">
          One {m.architecture === 'sage' ? 'GraphSAGE' : m.architecture.toUpperCase()} trained in two modes on the{' '}
          {int(m.n_pois)} mapped POIs of Lesotho ({int(m.n_labelled)} labelled, {m.categories.length} categories), each
          linked to its 8 nearest POIs. {m.n_models} models (5 spatial cross-validation splits × 5 seeds) score every
          request; {m.n_features} features. In <strong>site mode</strong> the {m.own_attributes.length} inputs that
          describe how the POI itself is mapped are hidden, so it works for an empty candidate site. Every score below
          is on areas the model never trained on.
        </p>
      </header>

      <div className="grid-2">
        {m.summary.map((s) => (
          <section className="card" key={s.mode}>
            <div className="chart-head">
              <h2>{MODE_TEXT[s.mode].title}</h2>
              <span className="hint">{MODE_TEXT[s.mode].subtitle}</span>
            </div>
            <div className="kpi-row">
              <StatTile label="Macro-F1" value={num(s.macro_f1, 3)} detail={`± ${num(s.macro_f1_sd, 3)} over 5 folds`} />
              <StatTile label="Accuracy" value={pct(s.accuracy)} />
              <StatTile label="Top-3 hit" value={pct(s.top3)} detail={`true category in top 3 (top 2: ${pct(s.top2)})`} />
              <StatTile label="Calibration error" value={num(s.ece, 3)} detail="ECE after temperature scaling" />
            </div>
          </section>
        ))}
      </div>

      <section className="card">
        <div className="chart-head">
          <h2>F1 per category (RO4)</h2>
          <Legend items={[['--series-1', 'Known mode'], ['--series-2', 'Site mode']]} />
        </div>
        <BarChart
          label="Test F1 per category in known and site mode"
          max={niceMax(perClass.flatMap((r) => [r.known.f1, r.site.f1]))}
          rows={perClass.map(({ known, site }) => ({
            key: known.category,
            label: known.category,
            bars: [
              { value: known.f1, display: num(known.f1), series: 1 as const,
                tip: <><strong>F1 {num(known.f1, 3)}</strong>{known.category} · known mode<br />precision {num(known.precision)} · recall {num(known.recall)} · top-3 {pct(known.top3)}</> },
              { value: site.f1, display: num(site.f1), series: 2 as const,
                tip: <><strong>F1 {num(site.f1, 3)}</strong>{site.category} · site mode<br />precision {num(site.precision)} · recall {num(site.recall)} · top-3 {pct(site.top3)}</> },
            ],
          }))}
        />
        <p className="hint">
          Site mode is reliable for Educational, Infrastructure and Retail; the small categories are hard to tell apart
          from the location alone.
        </p>
        <details>
          <summary className="hint">Table view</summary>
          <DataTable
            rows={perClass}
            rowKey={(r) => r.known.category}
            columns={[
              { key: 'c', header: 'Category', render: (r) => r.known.category },
              ...(['known', 'site'] as const).flatMap((md) => [
                { key: `${md}p`, header: `${md} precision`, num: true, render: (r: (typeof perClass)[number]) => num(r[md].precision) },
                { key: `${md}r`, header: `${md} recall`, num: true, render: (r: (typeof perClass)[number]) => num(r[md].recall) },
                { key: `${md}f`, header: `${md} F1`, num: true, render: (r: (typeof perClass)[number]) => num(r[md].f1) },
                { key: `${md}t`, header: `${md} top-3`, num: true, render: (r: (typeof perClass)[number]) => pct(r[md].top3) },
              ]),
            ]}
          />
        </details>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>What shapes an area (RO2): feature groups</h2>
          <p className="hint">
            Rise in log loss when a group is shuffled across all POIs (site mode, held-out folds); whiskers: ± 1 SD.
            Location and density dominate; neighbour categories add almost nothing.
          </p>
          <BarChart
            label="Permutation importance of feature groups"
            min={Math.min(...groups.map((g) => g.d_log_loss - g.sd))}
            max={niceMax(groups.map((g) => g.d_log_loss + g.sd), 0.05)}
            rows={groups.map((g) => ({
              key: g.unit,
              label: GROUP_NAMES[g.unit],
              bars: [{ value: g.d_log_loss, display: signed(g.d_log_loss, 3), whisker: [g.d_log_loss - g.sd, g.d_log_loss + g.sd] as [number, number],
                       tip: <><strong>{signed(g.d_log_loss, 3)} log loss</strong>SD {num(g.sd, 3)} · change in macro-F1 {signed(g.d_f1, 3)}</> }],
            }))}
          />
        </section>
        <section className="card">
          <h2>Most important single features</h2>
          <p className="hint">The 15 features whose shuffling raises log loss most; settlement density and spacing lead.</p>
          <BarChart
            label="Permutation importance of single features"
            max={niceMax(singles.map((g) => g.d_log_loss + g.sd), 0.01)}
            min={Math.min(0, ...singles.map((g) => g.d_log_loss - g.sd))}
            rows={singles.map((g) => ({
              key: g.unit,
              label: <code>{g.unit}</code>,
              bars: [{ value: g.d_log_loss, display: num(g.d_log_loss, 3), whisker: [g.d_log_loss - g.sd, g.d_log_loss + g.sd] as [number, number],
                       tip: <><strong>{signed(g.d_log_loss, 3)} log loss</strong>SD {num(g.sd, 3)} · change in macro-F1 {signed(g.d_f1, 3)}</> }],
            }))}
          />
        </section>
      </div>

      <section className="card">
        <h2>Neighbour influence (RO2)</h2>
        <p className="hint">
          Change in each predicted probability, in percentage points, from knowing the category of neighbours of one
          type (site mode, held-out POIs with such a neighbour, every other category visible; site-mode macro-F1 in this
          setting {num(m.site_f1_deployment, 3)}). Effects are small but structured: like attracts like, Retail and
          Food &amp; Beverage go together, schools sit near churches.
        </p>
        <Heatmap rowHeader="Neighbour type ↓ / predicted →" rows={infl.neighbour_categories} cols={infl.predicted_categories}
                 values={infl.values_pp} unit="pp" />
      </section>

      <section className="card">
        <h2>Ablations (RO1)</h2>
        <p className="hint">
          Each row changes one thing in the selected configuration (3 seeds). With local features only, message passing
          over the graph adds +0.08 site-mode F1: the GNN learns the neighbourhood from the graph.
        </p>
        <RecordTable
          rows={m.ablations}
          columns={[['ablation', 'Ablation'], ['features', 'Features'], ['test known', 'Test F1 known'], ['d known', 'Δ known'],
                    ['test site', 'Test F1 site'], ['d site', 'Δ site'], ['top3 site', 'Top-3 site']]}
        />
      </section>

      <details className="disclosure">
        <summary>More tables: architectures, folds, configuration and market-gap prior factors</summary>
        <div className="disclosure-body">
          <h3>Architecture comparison</h3>
          <RecordTable
            rows={m.architecture_comparison}
            columns={[['run', 'Layer'], ['val score', 'Val score'], ['test known', 'Test F1 known'], ['SD k', 'SD'],
                      ['test site', 'Test F1 site'], ['SD s', 'SD'], ['top3 site', 'Top-3 site'], ['epochs', 'Epochs']]}
          />
          <h3>Test folds (spatial cross-validation)</h3>
          <RecordTable rows={m.per_fold}
                       columns={[['test fold', 'Fold'], ['test nodes', 'POIs'], ['F1 known', 'F1 known'], ['F1 site', 'F1 site']]} />
          <h3>Selected configuration</h3>
          <RecordTable rows={Object.entries(m.config).map(([k, v]) => ({ setting: k, value: Array.isArray(v) ? v.join(' – ') : String(v) }))}
                       columns={[['setting', 'Setting'], ['value', 'Value']]} />
          <h3>Market-gap prior factors (RO3)</h3>
          <p className="hint">One factor per category makes the national expected totals equal the observed ones.</p>
          <RecordTable rows={Object.entries(m.prior_factors).map(([category, factor]) => ({ category, factor }))}
                       columns={[['category', 'Category'], ['factor', 'Factor']]} />
        </div>
      </details>
    </div>
  )
}
