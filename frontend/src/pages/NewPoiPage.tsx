import { useState, type FormEvent } from 'react'
import type { NewPoiRequest } from '../api/client'
import { useNewPoiPrediction } from '../api/queries'
import { ErrorAlert } from '../components/Feedback'
import { LocationFields } from '../components/LocationFields'
import { BaseMap, FitTo, PickCursor } from '../components/map/BaseMap'
import { LocationMarker, NeighbourLinks } from '../components/map/LocationLayers'
import { MapHint, MapLegend } from '../components/map/MapLegend'
import { PoiLayer } from '../components/map/PoiLayer'
import { PredictionView } from '../components/PredictionView'
import { useLocationParams } from '../hooks/useLocationParams'
import { inLesotho, neighbourhoodPoints } from '../lib/geo'

interface Attributes {
  name: boolean
  address: boolean
  hours: boolean
  footprint: string
  alsoPoint: boolean
  rank: string
  pcode: string
}

function attributesFrom(params: URLSearchParams): Attributes {
  return {
    name: params.get('name') === '1',
    address: params.get('address') === '1',
    hours: params.get('hours') === '1',
    footprint: params.get('fp') ?? '',
    alsoPoint: params.get('point') === '1',
    rank: params.get('rank') ?? '',
    pcode: params.get('pcode') ?? '',
  }
}

/** Known mode: a POI described as it would be mapped in OpenStreetMap, inserted into the graph as a new node. */
export function NewPoiPage() {
  const { params, lat, lon, draft, setDraft, commit, parseDraft } = useLocationParams()
  const committed = attributesFrom(params)
  const [attrs, setAttrs] = useState<Attributes>(committed)
  const [attrsKey, setAttrsKey] = useState(params.toString())
  if (attrsKey !== params.toString()) {
    setAttrsKey(params.toString())
    setAttrs(committed)
  }
  const [formError, setFormError] = useState<string | null>(null)

  const footprint = Number(committed.footprint) || 0
  const request: NewPoiRequest | null =
    lat !== null && lon !== null
      ? {
          lat,
          lon,
          has_name: committed.name,
          has_address: committed.address,
          has_hours: committed.hours,
          footprint_m2: footprint,
          also_point: committed.alsoPoint,
          osm_id_rank: committed.rank === '' ? null : Number(committed.rank),
          adm2_pcode: committed.pcode || null,
        }
      : null
  const query = useNewPoiPrediction(request)
  const result = query.isPlaceholderData ? undefined : query.data
  const top = result?.predictions[0]?.scores[0]?.category ?? null
  const [dLat, dLon] = [Number(draft.lat), Number(draft.lon)]
  const draftMoved = draft.lat !== '' && draft.lon !== '' && inLesotho(dLat, dLon) && (dLat !== lat || dLon !== lon)

  const run = (la: number, lo: number, a: Attributes) => {
    setFormError(null)
    commit({ lat: la, lon: lo, name: a.name, address: a.address, hours: a.hours, fp: a.footprint,
             point: Number(a.footprint) > 0 && a.alsoPoint, rank: a.rank, pcode: a.pcode })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseDraft()
    if (typeof parsed === 'string') return setFormError(parsed)
    const rank = attrs.rank === '' ? null : Number(attrs.rank)
    if (rank !== null && !(rank >= 0 && rank <= 1)) return setFormError('The mapping-date rank must be between 0 and 1.')
    if (attrs.footprint !== '' && !(Number(attrs.footprint) >= 0)) return setFormError('The outline area must be 0 or more.')
    run(parsed.lat, parsed.lon, attrs)
  }
  const set = <K extends keyof Attributes>(k: K, v: Attributes[K]) => setAttrs((a) => ({ ...a, [k]: v }))

  return (
    <div className="workspace">
      <aside className="panel">
        <header className="section">
          <h1>Score a new POI</h1>
          <p className="lead">
            Describe a place as it would be mapped in OpenStreetMap. In known mode the model also reads how the POI
            itself is mapped (name, address, opening hours, building outline): test macro-F1 0.356 against 0.245 for
            an empty site.
          </p>
        </header>

        <form className="form" onSubmit={submit}>
          <LocationFields lat={draft.lat} lon={draft.lon} onChange={(la, lo) => setDraft({ lat: la, lon: lo })}
                          pcode={attrs.pcode} onPcodeChange={(pc) => set('pcode', pc)} />
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field"><span>How it is mapped</span></legend>
            <label className="check">
              <input type="checkbox" checked={attrs.name} onChange={(e) => set('name', e.target.checked)} /> Has a name
            </label>
            <label className="check">
              <input type="checkbox" checked={attrs.address} onChange={(e) => set('address', e.target.checked)} /> Has
              an address
            </label>
            <label className="check">
              <input type="checkbox" checked={attrs.hours} onChange={(e) => set('hours', e.target.checked)} /> Has
              opening hours
            </label>
          </fieldset>
          <div className="fields">
            <label className="field">
              <span>Building outline (m²)</span>
              <input type="number" min={0} step="any" placeholder="0 = point only" value={attrs.footprint}
                     onChange={(e) => set('footprint', e.target.value)} />
            </label>
            <label className="field">
              <span>Mapping-date rank (0–1)</span>
              <input type="number" min={0} max={1} step={0.01} placeholder="like its surroundings" value={attrs.rank}
                     onChange={(e) => set('rank', e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" disabled={!(Number(attrs.footprint) > 0)} checked={attrs.alsoPoint}
                   onChange={(e) => set('alsoPoint', e.target.checked)} />
            Also mapped as a point (as well as the outline)
          </label>
          <button className="btn btn-primary" type="submit" disabled={query.isFetching}>
            {query.isFetching ? 'Inserting into the graph…' : 'Score this POI'}
          </button>
        </form>

        <ErrorAlert error={formError ?? query.error} />
        {query.data && (
          <div className={query.isPlaceholderData ? 'loading' : undefined}>
            <PredictionView data={query.data} />
          </div>
        )}
      </aside>

      <section className="map-pane" aria-label="Map">
        <BaseMap onPick={(la, lo) => setDraft({ lat: String(la), lon: String(lo) })}>
          <PickCursor />
          <PoiLayer highlight={top} />
          {result && <NeighbourLinks lat={result.lat} lon={result.lon} neighbours={result.context.neighbours} />}
          {request && <LocationMarker lat={request.lat} lon={request.lon} />}
          {draftMoved && <LocationMarker lat={dLat} lon={dLon} rings={false} />}
          <FitTo points={result ? neighbourhoodPoints(result) : null} />
        </BaseMap>
        {!request && !draftMoved && <MapHint>Click the map to place the POI, then describe it and score it</MapHint>}
        {draftMoved && <MapHint>Position set: press “Score this POI”</MapHint>}
        <MapLegend
          entries={[
            { swatch: 'swatch-site', label: 'The new POI' },
            ...(top ? [{ swatch: 'swatch-highlight', label: `Mapped ${top} POIs (most likely category)` }] : []),
            { swatch: 'swatch-poi', label: 'Other mapped POIs' },
          ]}
        />
      </section>
    </div>
  )
}
