import { useState, type FormEvent } from 'react'
import { useSitePrediction } from '../api/queries'
import { ErrorAlert } from '../components/Feedback'
import { LocationFields } from '../components/LocationFields'
import { BaseMap, FitTo, PickCursor } from '../components/map/BaseMap'
import { LocationMarker, NeighbourLinks } from '../components/map/LocationLayers'
import { MapHint, MapLegend } from '../components/map/MapLegend'
import { PoiLayer } from '../components/map/PoiLayer'
import { PredictionView } from '../components/PredictionView'
import { useLocationParams } from '../hooks/useLocationParams'
import { MASERU, neighbourhoodPoints } from '../lib/geo'

/** RO3/RO4: what a candidate site, where no business stands yet, resembles (site mode). */
export function SitePage() {
  const { params, lat, lon, draft, setDraft, commit, parseDraft } = useLocationParams()
  const pcode = params.get('pcode') ?? ''
  const [formError, setFormError] = useState<string | null>(null)

  const request = lat !== null && lon !== null ? { lat, lon, adm2_pcode: pcode || null } : null
  const query = useSitePrediction(request)
  const result = query.isPlaceholderData ? undefined : query.data
  const top = result?.predictions[0]?.scores[0]?.category ?? null

  const analyse = (la: number, lo: number, pc = pcode) => {
    setFormError(null)
    commit({ lat: la, lon: lo, pcode: pc })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseDraft()
    if (typeof parsed === 'string') setFormError(parsed)
    else analyse(parsed.lat, parsed.lon)
  }

  return (
    <div className="workspace">
      <aside className="panel">
        <header className="section">
          <h1>What does this location suit?</h1>
          <p className="lead">
            Click the map or enter coordinates. The model scores the spot as an empty candidate site: it sees only the
            location and the mapped POIs around it, never anything about a business there.
          </p>
        </header>

        <form className="form" onSubmit={submit}>
          <LocationFields
            lat={draft.lat}
            lon={draft.lon}
            onChange={(la, lo) => setDraft({ lat: la, lon: lo })}
            pcode={pcode}
            onPcodeChange={(pc) => {
              const parsed = parseDraft()
              if (typeof parsed !== 'string') analyse(parsed.lat, parsed.lon, pc)
            }}
          />
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={query.isFetching}>
              {query.isFetching ? 'Scoring with 25 models…' : 'Analyse location'}
            </button>
            {!request && (
              <button className="btn btn-link" type="button" onClick={() => analyse(MASERU[0], MASERU[1])}>
                Try central Maseru
              </button>
            )}
          </div>
        </form>

        <ErrorAlert error={formError ?? query.error} />
        {query.data && (
          <div className={query.isPlaceholderData ? 'loading' : undefined}>
            <PredictionView data={query.data} />
          </div>
        )}
      </aside>

      <section className="map-pane" aria-label="Map">
        <BaseMap onPick={(la, lo) => analyse(la, lo, '')}>
          <PickCursor />
          <PoiLayer highlight={top} />
          {result && <NeighbourLinks lat={result.lat} lon={result.lon} neighbours={result.context.neighbours} />}
          {request && <LocationMarker lat={request.lat} lon={request.lon} />}
          <FitTo points={result ? neighbourhoodPoints(result) : null} />
        </BaseMap>
        {!request && <MapHint>Click anywhere in Lesotho to analyse that spot</MapHint>}
        <MapLegend
          entries={[
            { swatch: 'swatch-site', label: 'Analysed location (rings: 500 m, 2 km)' },
            ...(top ? [{ swatch: 'swatch-highlight', label: `Mapped ${top} POIs (most likely category)` }] : []),
            { swatch: 'swatch-poi', label: 'Other mapped POIs' },
          ]}
        >
          {result && <span className="hint">Lines: its 8 nearest POIs, the graph neighbours the model reads</span>}
        </MapLegend>
      </section>
    </div>
  )
}
