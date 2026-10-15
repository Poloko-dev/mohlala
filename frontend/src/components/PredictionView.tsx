import type { LocationContext, Prediction } from '../api/client'
import { int, km, metres, pct } from '../lib/format'
import { Callout } from './Feedback'
import { GapTable } from './GapTable'
import { ProbabilityChart } from './ProbabilityChart'

/** A model result: the category probabilities per mode, where the location lies, and its sub-district's signals. */
export function PredictionView({ data }: { data: Prediction }) {
  return (
    <div className="stack">
      <div className="section">
        <h2>{data.title}</h2>
        <p className="hint">{data.note}</p>
      </div>

      {data.predictions.map((p) => (
        <div className="section" key={p.mode}>
          <ProbabilityChart prediction={p} trueCategory={data.true_category} />
          <p className="hint">
            Most likely: {p.scores.slice(0, 3).map((s) => `${s.category} (${pct(s.probability)})`).join(', ')}
            {data.true_category && <> · mapped as {data.true_category}</>}
          </p>
        </div>
      ))}
      <Callout>
        Training weights the small categories up, so their probabilities run high: read the ranking, not the
        percentages, as odds. Test F1 and top-3 (hover a bar) say how reliable the model is for that category.
      </Callout>

      <ContextView context={data.context} />

      <div className="section">
        <h2>Market signals in {data.context.sub_district}</h2>
        {data.market_signals.length ? (
          <>
            <GapTable rows={data.market_signals} showArea={false} />
            <p className="hint">
              A gap: locations here resemble where the category is found elsewhere in Lesotho, but fewer are mapped
              than expected. A hypothesis about unmet demand or missing data, not proof of profitability.
            </p>
          </>
        ) : (
          <p className="hint">No flagged gaps or clusters in this sub-district.</p>
        )}
      </div>
    </div>
  )
}

function ContextView({ context: c }: { context: LocationContext }) {
  return (
    <div className="section">
      <h2>Location</h2>
      <dl className="facts">
        <dt>District</dt>
        <dd>{c.district}</dd>
        <dt>Sub-district</dt>
        <dd>
          {c.sub_district} <span className="hint">({c.adm2_pcode})</span>
        </dd>
        <dt>Nearest town</dt>
        <dd>
          {c.nearest_town}, {km(c.dist_town_km)}
        </dd>
        <dt>Mapped POIs</dt>
        <dd>
          {int(c.pois_500m)} within 500 m, {int(c.pois_2km)} within 2 km · {c.urban ? 'urban' : 'rural'}
        </dd>
      </dl>
      <h3>8 nearest mapped POIs (its neighbours in the graph)</h3>
      <ul className="neighbour-list">
        {c.neighbours.map((n) => (
          <li key={n.node_id}>
            <span className="name">
              {n.name ?? <span className="hint">(unnamed)</span>} <span className="hint">· {n.category}</span>
            </span>
            <span className="hint num">{metres(n.distance_m)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
