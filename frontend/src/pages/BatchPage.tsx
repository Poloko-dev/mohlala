import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import type { BatchRow, Mode } from '../api/client'
import { batchCsvUrl, useBatchJob, useStartBatch } from '../api/queries'
import { DataTable } from '../components/DataTable'
import { ErrorAlert, Progress } from '../components/Feedback'
import { BaseMap, FlyTo } from '../components/map/BaseMap'
import { MapLegend } from '../components/map/MapLegend'
import { PoiLayer } from '../components/map/PoiLayer'
import { pct } from '../lib/format'
import { useMapColors } from '../lib/theme'

const TEMPLATES: Record<Mode, string> = {
  site: 'name,lat,lon,adm2_pcode\nCentral Maseru,-29.3151,27.4869,\nQuthing town,-30.4005,27.7013,\n',
  known:
    'name,lat,lon,has_name,has_address,has_hours,footprint_m2,is_point,osm_id_rank,adm2_pcode\n' +
    'Shop A,-29.3151,27.4869,1,0,1,120,0,,\nKiosk B,-30.4005,27.7013,1,0,0,0,1,,\n',
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

/** Score every row of a CSV: candidate sites (site mode) or POIs described as mapped (known mode). */
export function BatchPage() {
  const colors = useMapColors()
  const input = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('site')
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const start = useStartBatch()
  const job = useBatchJob(jobId)
  const state = job.data
  const result = state?.status === 'succeeded' ? state.result : null
  const running = start.isPending || state?.status === 'queued' || state?.status === 'running'
  const scored = (result?.rows ?? []).filter((r): r is BatchRow & { lat: number; lon: number } =>
    r.error === null && r.lat !== null && r.lon !== null)
  const focus = scored.find((r) => r.row === selected)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setSelected(null)
    start.mutate({ file, mode }, { onSuccess: (j) => setJobId(j.id) })
  }
  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  return (
    <div className="workspace">
      <aside className="panel">
        <header className="section">
          <h1>Score a CSV</h1>
          <p className="lead">
            Upload a CSV with <code>lat</code> and <code>lon</code> columns. Every row is scored with the 25 models and
            the predictions are appended to your columns.
          </p>
        </header>

        <form className="form" onSubmit={submit}>
          <div className="segmented" role="radiogroup" aria-label="Mode">
            <label>
              <input type="radio" name="mode" checked={mode === 'site'} onChange={() => setMode('site')} />
              Candidate sites
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === 'known'} onChange={() => setMode('known')} />
              Mapped POIs (known mode)
            </label>
          </div>
          <p className="hint">
            {mode === 'site'
              ? 'Optional column: adm2_pcode (sub-district). About half a second per row.'
              : 'Optional columns: has_name, has_address, has_hours (0/1), footprint_m2, is_point (0/1), osm_id_rank (0–1), adm2_pcode. About two seconds per row.'}{' '}
            <button type="button" className="btn btn-link" onClick={() => downloadText(`template_${mode}.csv`, TEMPLATES[mode])}>
              Download a template
            </button>
          </p>
          <div
            className={over ? 'dropzone over' : 'dropzone'}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
          >
            {file ? <strong>{file.name}</strong> : 'Drop a CSV here or click to choose one'}
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={!file || running}>
            {running ? 'Scoring…' : 'Score the file'}
          </button>
        </form>

        <ErrorAlert error={start.error ?? job.error ?? (state?.status === 'failed' ? state.error : null)} />
        {state && running && (
          <Progress done={state.progress.done} total={state.progress.total}
                    label={`Scored ${state.progress.done} of ${state.progress.total} rows`} />
        )}

        {result && jobId && (
          <div className="section">
            <div className="chart-head">
              <h2>
                {result.scored} rows scored{result.failed > 0 && `, ${result.failed} failed`}
              </h2>
              <a className="btn" href={batchCsvUrl(jobId)} download>
                Download CSV
              </a>
            </div>
            <DataTable
              rows={result.rows}
              rowKey={(r) => r.row}
              selectedKey={selected}
              onRowClick={(r) => setSelected(r.row)}
              scroll
              columns={[
                { key: 'row', header: 'Row', num: true, render: (r) => r.row },
                { key: 'pred', header: 'Predicted', render: (r) => r.pred_category ?? '—' },
                { key: 'p', header: 'Prob.', num: true, render: (r) => (r.pred_prob === null ? '—' : pct(r.pred_prob)) },
                {
                  key: 'top3',
                  header: 'Top 3 / error',
                  render: (r) => (r.error ? <span style={{ color: 'var(--critical)' }}>{r.error}</span> : r.top3.join(', ')),
                },
              ]}
            />
          </div>
        )}
      </aside>

      <section className="map-pane" aria-label="Map">
        <BaseMap>
          <PoiLayer />
          {scored.map((r) => (
            <CircleMarker
              key={r.row}
              center={[r.lat, r.lon]}
              radius={r.row === selected ? 10 : 7}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => setSelected(r.row) }}
              pathOptions={{ color: r.row === selected ? colors.ink : colors.surface, weight: 2, fillColor: colors.site, fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <strong>
                  Row {r.row}: {r.pred_category} ({r.pred_prob === null ? '' : pct(r.pred_prob)})
                </strong>
                <br />
                Top 3: {r.top3.join(', ')}
              </Tooltip>
            </CircleMarker>
          ))}
          <FlyTo center={focus ? [focus.lat, focus.lon] : null} zoom={13} />
        </BaseMap>
        <MapLegend
          entries={[
            { swatch: 'swatch-site', label: 'Scored rows (hover for the prediction)' },
            { swatch: 'swatch-poi', label: 'Mapped POIs' },
          ]}
        />
      </section>
    </div>
  )
}
