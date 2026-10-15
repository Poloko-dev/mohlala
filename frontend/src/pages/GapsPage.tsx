import { useDeferredValue, useMemo, useState } from 'react'
import { CircleMarker, Tooltip } from 'react-leaflet'
import type { Area, GapRow } from '../api/client'
import { useAreas, useMarketGaps, useModelInfo } from '../api/queries'
import { Callout, ErrorAlert } from '../components/Feedback'
import { GapTable } from '../components/GapTable'
import { BaseMap, FlyTo } from '../components/map/BaseMap'
import { MapLegend } from '../components/map/MapLegend'
import { PoiLayer } from '../components/map/PoiLayer'
import { num, signed } from '../lib/format'
import { gapKey } from '../lib/gaps'
import { useMapColors } from '../lib/theme'

type SignalFilter = 'both' | 'gap' | 'cluster'

/** Flagged rows that share a sub-district are spread on a small circle around its centre so none hides another. */
function placeRows(rows: GapRow[], areas: Map<string, Area>) {
  const byArea = new Map<string, GapRow[]>()
  for (const r of rows) byArea.set(r.adm2_pcode, [...(byArea.get(r.adm2_pcode) ?? []), r])
  const placed: { row: GapRow; lat: number; lon: number }[] = []
  for (const [pcode, group] of byArea) {
    const a = areas.get(pcode)
    if (!a) continue
    group.forEach((row, i) => {
      const angle = (2 * Math.PI * i) / group.length
      const d = group.length > 1 ? 0.018 : 0 // about 2 km
      placed.push({ row, lat: a.lat + d * Math.sin(angle), lon: a.lon + (d * Math.cos(angle)) / Math.cos((a.lat * Math.PI) / 180) })
    })
  }
  return placed
}

/** RO3: expected against observed POIs per sub-district and category, from the model's site-mode probabilities. */
export function GapsPage() {
  const colors = useMapColors()
  const { data: model } = useModelInfo()
  const { data: areaList } = useAreas()
  const [includeAll, setIncludeAll] = useState(false)
  const gaps = useMarketGaps(!includeAll)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [signal, setSignal] = useState<SignalFilter>('both')
  const [selected, setSelected] = useState<string | null>(null)
  const query = useDeferredValue(search.trim().toLowerCase())

  const areas = useMemo(() => new Map((areaList ?? []).map((a) => [a.adm2_pcode, a])), [areaList])
  const rows = useMemo(
    () =>
      (gaps.data ?? [])
        .filter((g) => !category || g.category === category)
        .filter((g) => signal === 'both' || g.signal === signal || (includeAll && !g.signal))
        .filter((g) => !query || `${g.adm2_name} ${g.adm1_name} ${g.adm2_pcode}`.toLowerCase().includes(query))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z)),
    [gaps.data, category, signal, includeAll, query],
  )
  const flagged = useMemo(() => rows.filter((r) => r.signal), [rows])
  const placed = useMemo(() => placeRows(flagged, areas), [flagged, areas])
  const focus = placed.find((p) => gapKey(p.row) === selected)
  const counts = { gap: flagged.filter((r) => r.signal === 'gap').length, cluster: flagged.filter((r) => r.signal === 'cluster').length }

  return (
    <div className="workspace" style={{ gridTemplateColumns: 'minmax(360px, 640px) 1fr' }}>
      <aside className="panel">
        <header className="section">
          <h1>Market gaps</h1>
          <p className="lead">
            For every mapped POI, the model&apos;s site-mode probabilities say what its location resembles. Summed over a
            sub-district they give the <strong>expected</strong> number of each category, compared here with the
            number <strong>observed</strong> on the map (prior-corrected to the national pattern).
          </p>
        </header>

        <div className="form">
          <div className="fields">
            <label className="field">
              <span>Area</span>
              <input type="search" placeholder="Sub-district, district or code" value={search}
                     onChange={(e) => setSearch(e.target.value)} />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {model?.categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="segmented" role="radiogroup" aria-label="Signal">
              {(['both', 'gap', 'cluster'] as const).map((s) => (
                <label key={s}>
                  <input type="radio" name="signal" checked={signal === s} onChange={() => setSignal(s)} />
                  {s === 'both' ? 'Gaps and clusters' : s === 'gap' ? 'Gaps' : 'Clusters'}
                </label>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
              Include unflagged rows
            </label>
          </div>
        </div>

        <ErrorAlert error={gaps.error} />
        <div className={gaps.isPlaceholderData ? 'section loading' : 'section'}>
          <p className="hint">
            {rows.length} rows · {counts.gap} gaps · {counts.cluster} clusters. Sorted by |z|; click a row to find it on
            the map.
          </p>
          {rows.length ? (
            <GapTable rows={rows} selectedKey={selected} onRowClick={(g) => setSelected(gapKey(g))} scroll />
          ) : (
            <p className="empty">No rows match these filters.</p>
          )}
        </div>
        <Callout>
          A <strong>gap</strong> (z ≥ 2 and at least 2 POIs short) means the locations in an area resemble where a
          category is found elsewhere in Lesotho, but it is mapped there less often than expected; a{' '}
          <strong>cluster</strong> is the reverse. Only sub-districts with at least 20 labelled POIs are flagged. A gap
          is a hypothesis about unmet demand or missing data — <em>thin mapping</em> marks areas where missing data is
          likely — not evidence of profitability.
        </Callout>
      </aside>

      <section className="map-pane" aria-label="Map">
        <BaseMap>
          <PoiLayer highlight={null} />
          {placed.map(({ row, lat, lon }) => {
            const isSel = gapKey(row) === selected
            return (
              <CircleMarker
                key={gapKey(row)}
                center={[lat, lon]}
                radius={Math.min(22, 5 + 2.2 * Math.sqrt(Math.abs(row.gap)))}
                bubblingMouseEvents={false}
                eventHandlers={{ click: () => setSelected(gapKey(row)) }}
                pathOptions={{
                  color: isSel ? colors.ink : colors.surface,
                  weight: 2,
                  fillColor: row.signal === 'gap' ? colors.gap : colors.cluster,
                  fillOpacity: row.mapping ? 0.45 : 0.9,
                }}
              >
                <Tooltip direction="top">
                  <strong>
                    {row.adm2_name}: {row.category} {row.signal}
                  </strong>
                  <br />
                  {row.observed} mapped, {num(row.expected, 1)} expected (gap {signed(row.gap)}, z {signed(row.z, 2)})
                  {row.mapping && (
                    <>
                      <br />
                      Thin mapping: may be missing data
                    </>
                  )}
                </Tooltip>
              </CircleMarker>
            )
          })}
          <FlyTo center={focus ? [focus.lat, focus.lon] : null} zoom={10} />
        </BaseMap>
        <MapLegend
          entries={[
            { swatch: 'swatch-gap', label: 'Gap: fewer mapped than expected' },
            { swatch: 'swatch-cluster', label: 'Cluster: more mapped than expected' },
          ]}
        >
          <span className="hint">Size: |expected − observed|. Faded: thin mapping. Placed at the mean position of the sub-district&apos;s POIs.</span>
        </MapLegend>
      </section>
    </div>
  )
}
