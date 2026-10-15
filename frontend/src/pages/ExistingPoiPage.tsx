import { useDeferredValue, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useExistingPrediction, usePoiSearch } from '../api/queries'
import { ErrorAlert } from '../components/Feedback'
import { BaseMap, FitTo } from '../components/map/BaseMap'
import { LocationMarker, NeighbourLinks } from '../components/map/LocationLayers'
import { MapHint, MapLegend } from '../components/map/MapLegend'
import { PoiLayer } from '../components/map/PoiLayer'
import { PredictionView } from '../components/PredictionView'
import { neighbourhoodPoints } from '../lib/geo'

/** RO4: the notebook's predictions for a mapped POI in both modes (out-of-fold, so the model never saw it). */
export function ExistingPoiPage() {
  const { nodeId: raw } = useParams()
  const navigate = useNavigate()
  const nodeId = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null
  const [search, setSearch] = useState('')
  const q = useDeferredValue(search.trim())
  const results = usePoiSearch(q)
  const prediction = useExistingPrediction(nodeId)
  const data = prediction.isPlaceholderData ? undefined : prediction.data
  const mapped = data?.true_category ?? null

  return (
    <div className="workspace">
      <aside className="panel">
        <header className="section">
          <h1>Existing POIs</h1>
          <p className="lead">
            How the model scores a POI that is already mapped. Labelled POIs are scored by the models that never trained
            on their area (out-of-fold), so this is an honest test: compare the prediction with the mapped category.
          </p>
        </header>

        <label className="field">
          <span>Find a POI</span>
          <input type="search" placeholder="Name, node_id, or OSM id such as node/4340647091" value={search}
                 onChange={(e) => setSearch(e.target.value)} autoFocus={nodeId === null} />
        </label>
        <ErrorAlert error={results.error} />
        {q && results.data && (
          results.data.length ? (
            <ul className="search-results">
              {results.data.map((p) => (
                <li key={p.node_id}>
                  <button type="button" aria-current={p.node_id === nodeId} onClick={() => navigate(`/pois/${p.node_id}`)}>
                    <span>{p.name ?? '(unnamed)'}</span>
                    <span className="sub">
                      {p.category} · {p.sub_district}, {p.district} · {p.osm_id} · {p.tag}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No POI matches “{q}”.</p>
          )
        )}
        {nodeId === null && !q && <p className="hint">…or click any POI on the map and choose “View model predictions”.</p>}

        <ErrorAlert error={prediction.error} />
        {prediction.data && (
          <div className={prediction.isPlaceholderData ? 'loading' : undefined}>
            {prediction.data.poi && (
              <p className="hint">
                {prediction.data.poi.sub_district}, {prediction.data.poi.district} ·{' '}
                <a href={`https://www.openstreetmap.org/${prediction.data.poi.osm_id}`} target="_blank" rel="noreferrer">
                  open {prediction.data.poi.osm_id} on OpenStreetMap
                </a>
              </p>
            )}
            <PredictionView data={prediction.data} />
          </div>
        )}
        {raw !== undefined && nodeId === null && (
          <p className="hint">
            “{raw}” is not a node id. <Link to="/pois">Search instead</Link>.
          </p>
        )}
      </aside>

      <section className="map-pane" aria-label="Map">
        <BaseMap>
          <PoiLayer highlight={mapped} />
          {data && <NeighbourLinks lat={data.lat} lon={data.lon} neighbours={data.context.neighbours} />}
          {data && <LocationMarker lat={data.lat} lon={data.lon} />}
          <FitTo points={data ? neighbourhoodPoints(data) : null} />
        </BaseMap>
        {nodeId === null && <MapHint>Click a POI to see how the model scores it</MapHint>}
        <MapLegend
          entries={[
            { swatch: 'swatch-site', label: 'Selected POI' },
            ...(mapped ? [{ swatch: 'swatch-highlight', label: `Other mapped ${mapped} POIs` }] : []),
            { swatch: 'swatch-poi', label: mapped ? 'Other mapped POIs' : 'Mapped POIs' },
          ]}
        />
      </section>
    </div>
  )
}
