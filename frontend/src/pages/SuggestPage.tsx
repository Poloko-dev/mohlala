import { useState, type FormEvent } from 'react'
import L from 'leaflet'
import { Circle, CircleMarker, Marker, Tooltip } from 'react-leaflet'
import type { SuggestedSite } from '../api/client'
import { useModelInfo, useStartSuggestion, useSuggestionJob } from '../api/queries'
import { DataTable } from '../components/DataTable'
import { Callout, ErrorAlert, Progress } from '../components/Feedback'
import { LocationFields } from '../components/LocationFields'
import { BaseMap, FitTo, FlyTo, PickCursor } from '../components/map/BaseMap'
import { LocationMarker } from '../components/map/LocationLayers'
import { MapHint, MapLegend } from '../components/map/MapLegend'
import { PoiLayer } from '../components/map/PoiLayer'
import { int, km, num, pct } from '../lib/format'
import { circleBounds, inLesotho } from '../lib/geo'
import { useMapColors } from '../lib/theme'

const siteKey = (s: SuggestedSite) => `${s.lat},${s.lon}`

/** A legend bar of discrete colour steps, matching the binned markers. */
const steppedGradient = (steps: string[]) =>
  `linear-gradient(to right, ${steps.map((c, i) => `${c} ${(i * 100) / steps.length}% ${((i + 1) * 100) / steps.length}%`).join(', ')})`

const rankIcon = (rank: number) =>
  L.divIcon({ className: 'rank-icon', html: String(rank), iconSize: [18, 18], iconAnchor: [-6, 9] })

/** Sequential bins (one hue, light to dark) of the requested category's probability across the scored grid. */
function binOf(p: number, lo: number, hi: number) {
  if (hi - lo < 1e-9) return 4
  return Math.min(4, Math.floor(((p - lo) / (hi - lo)) * 5))
}

/** RO3/RO4: rank a grid of candidate sites around a location for one category (site mode, a background job). */
export function SuggestPage() {
  const { data: model } = useModelInfo()
  const colors = useMapColors()
  const [category, setCategory] = useState('Retail')
  const [radius, setRadius] = useState('2')
  const [step, setStep] = useState('')
  const [center, setCenter] = useState({ lat: '', lon: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const start = useStartSuggestion()
  const job = useSuggestionJob(jobId)
  const state = job.data
  const result = state?.status === 'succeeded' ? state.result : null
  const running = start.isPending || state?.status === 'queued' || state?.status === 'running'

  const cLat = Number(center.lat)
  const cLon = Number(center.lon)
  const hasCenter = center.lat !== '' && center.lon !== '' && inLesotho(cLat, cLon)
  const radiusKm = Number(radius)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!hasCenter) return setFormError('Click the map or enter the coordinates of a centre inside Lesotho.')
    if (!(radiusKm > 0 && radiusKm <= 10)) return setFormError('The radius must be between 0 and 10 km.')
    setSelected(null)
    setShowAll(false)
    start.mutate(
      { category, lat: cLat, lon: cLon, radius_km: radiusKm, step_m: step === '' ? null : Number(step) },
      { onSuccess: (j) => setJobId(j.id) },
    )
  }

  const sites = result?.sites ?? []
  const probs = sites.map((s) => s.probability)
  const [lo, hi] = [Math.min(...probs), Math.max(...probs)]
  const listed = showAll ? sites : sites.slice(0, 10)
  const focus = sites.find((s) => siteKey(s) === selected)

  return (
    <div className="workspace">
      <aside className="panel">
        <header className="section">
          <h1>Where should this business go?</h1>
          <p className="lead">
            Pick a category and a centre. The model scores a grid of empty candidate sites within the radius (site
            mode) and ranks them by how strongly the location and its surroundings resemble where that category is
            mapped. Points more than 1.5 km from any mapped POI are skipped.
          </p>
        </header>

        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {(model?.categories ?? ['Retail']).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <LocationFields lat={center.lat} lon={center.lon} onChange={(la, lo2) => setCenter({ lat: la, lon: lo2 })} />
          <div className="fields">
            <label className="field">
              <span>Radius (km)</span>
              <input type="number" min={0.1} max={10} step={0.1} value={radius} onChange={(e) => setRadius(e.target.value)} />
            </label>
            <label className="field">
              <span>Grid spacing (m)</span>
              <input type="number" min={50} max={5000} step={10} placeholder="about 49 sites" value={step}
                     onChange={(e) => setStep(e.target.value)} />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={running}>
            {running ? 'Scoring candidate sites…' : 'Find the best sites'}
          </button>
        </form>

        <ErrorAlert error={formError ?? start.error ?? job.error ?? (state?.status === 'failed' ? state.error : null)} />
        {state && running && (
          <Progress
            done={state.progress.done}
            total={state.progress.total}
            label={`Scored ${state.progress.done} of ${state.progress.total} candidate sites (about half a second each)`}
          />
        )}

        {result && (
          <div className="section">
            <h2>
              Best sites for {result.category}{' '}
              <span className="hint">
                ({sites.length} scored, {Math.round(result.step_m)} m apart)
              </span>
            </h2>
            <DataTable
              rows={listed}
              rowKey={siteKey}
              selectedKey={selected}
              onRowClick={(s) => setSelected(siteKey(s))}
              columns={[
                { key: 'rank', header: '#', num: true, render: (s) => sites.indexOf(s) + 1 },
                { key: 'p', header: `p(${result.category})`, num: true, render: (s) => pct(s.probability, 1) },
                { key: 'cr', header: 'Its rank', num: true, render: (s) => `${s.class_rank} of 8` },
                { key: 'ml', header: 'Most likely', render: (s) => s.most_likely },
                { key: 'cat', header: `${result.category} ≤ 1 km`, num: true, render: (s) => int(s.category_within_1km) },
                { key: 'all', header: 'POIs ≤ 1 km', num: true, render: (s) => int(s.pois_within_1km) },
                { key: 'town', header: 'Town', render: (s) => `${s.town} (${km(s.town_km)})` },
              ]}
            />
            {sites.length > 10 && (
              <button className="btn btn-link" type="button" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show the top 10' : `Show all ${sites.length} sites`}
              </button>
            )}
            <Callout>
              p({result.category}) is how strongly the spot resembles where {result.category} POIs are mapped
              (site-mode test F1 for {result.category}: {result.category_test_f1 === null ? '–' : num(result.category_test_f1)},
              top-3 hit {result.category_test_top3 === null ? '–' : pct(result.category_test_top3)}). A high
              probability with few {result.category} POIs within 1 km is a candidate gap; with many, an established
              cluster. Presence on the map is not proof of profitability.
            </Callout>
          </div>
        )}
      </aside>

      <section className="map-pane" aria-label="Map">
        <BaseMap onPick={(la, lo2) => setCenter({ lat: String(la), lon: String(lo2) })}>
          <PickCursor />
          <PoiLayer highlight={category} />
          {hasCenter && radiusKm > 0 && (
            <Circle center={[cLat, cLon]} radius={radiusKm * 1000} interactive={false}
                    pathOptions={{ color: colors.ink2, weight: 1.5, fillColor: colors.site, fillOpacity: 0.04 }} />
          )}
          {sites.map((s, i) => {
            const isSel = siteKey(s) === selected
            return (
              <CircleMarker
                key={siteKey(s)}
                center={[s.lat, s.lon]}
                radius={isSel ? 10 : 7}
                bubblingMouseEvents={false}
                eventHandlers={{ click: () => setSelected(siteKey(s)) }}
                pathOptions={{ color: isSel ? colors.ink : colors.surface, weight: 2,
                               fillColor: colors.seq[binOf(s.probability, lo, hi)], fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <strong>
                    #{i + 1} · {pct(s.probability, 1)} {result?.category}
                  </strong>
                  <br />
                  Most likely {s.most_likely} · {s.category_within_1km} {result?.category} within 1 km
                </Tooltip>
              </CircleMarker>
            )
          })}
          {sites.slice(0, 3).map((s, i) => (
            <Marker key={`r${siteKey(s)}`} position={[s.lat, s.lon]} icon={rankIcon(i + 1)} interactive={false} />
          ))}
          {hasCenter && <LocationMarker lat={cLat} lon={cLon} rings={false} />}
          <FlyTo center={focus ? [focus.lat, focus.lon] : hasCenter && !result ? [cLat, cLon] : null} zoom={13} />
          <FitTo points={result ? circleBounds(result.lat, result.lon, result.radius_km) : null} maxZoom={16} />
        </BaseMap>
        {!hasCenter && <MapHint>Click the map to set the centre of the search</MapHint>}
        <MapLegend
          entries={[
            { swatch: 'swatch-site', label: 'Centre of the search' },
            { swatch: 'swatch-highlight', label: `Mapped ${category} POIs` },
            { swatch: 'swatch-poi', label: 'Other mapped POIs' },
          ]}
        >
          {result && sites.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              <span>Candidate sites: p({result.category})</span>
              <div className="scale-bar" style={{ background: steppedGradient(colors.seq) }} aria-hidden />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>{pct(lo, 1)}</span>
                <span>{pct(hi, 1)}</span>
              </div>
            </div>
          )}
        </MapLegend>
      </section>
    </div>
  )
}
