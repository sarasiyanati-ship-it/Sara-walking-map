// The side panel: layer switch, legend, park details and the method note.
import { BAND_M, CATCHMENT_M, CATCHMENT_MIN, GRID_M, SAMPLE_M } from '../lib/analysis.js'
import { PARK_RULES } from '../lib/parks.js'
import { MAX_SNAP_M, WALK_M_PER_MIN } from '../lib/routing.js'
import { COLORS, TIME_CLASSES, pressureColor } from './colors.js'

export const LAYERS = [
  { id: 'time', label: 'Walking time to the nearest park' },
  { id: 'catchment', label: 'Park catchments & estimated residents' },
  { id: 'pressure', label: 'Potential park pressure' },
]

const fmt = (n) => n.toLocaleString('en-GB')

export function Tag({ kind }) {
  return kind === 'data'
    ? <span className="tag tag-data" title="Taken or measured directly from the data files">From data</span>
    : <span className="tag tag-model" title="Calculated by this app's model, with the assumptions in 'How it's calculated'">Modelled estimate</span>
}

export default function Panel({ analysis, layer, setLayer, selected, onSelect }) {
  const { green } = analysis
  const park = selected == null ? null : green.parks[selected]
  return (
    <aside className="panel">
      <header>
        <h1>Park Pressure &amp; Accessibility Explorer</h1>
        <p className="lede">
          How far is each place in central Weimar from the nearest park, how many residents live within a{' '}
          {CATCHMENT_MIN}-minute walk of each park, and which parks may face more potential pressure for their size?
        </p>
      </header>

      <fieldset className="layers">
        <legend>Map layer</legend>
        {LAYERS.map((l) => (
          <label key={l.id} className={layer === l.id ? 'is-active' : ''}>
            <input type="radio" name="layer" value={l.id} checked={layer === l.id} onChange={() => setLayer(l.id)} />
            {l.label}
          </label>
        ))}
      </fieldset>

      <Legend analysis={analysis} layer={layer} selected={selected} />

      <section>
        <h2>Parks</h2>
        <div className="park-buttons">
          {green.parks.map((p) => (
            <button key={p.label} className={selected === p.index ? 'is-selected' : ''}
              onClick={() => onSelect(selected === p.index ? null : p.index)}>
              {p.label.slice(-1)}
              {p.edge !== 'none' && <span aria-label="warning"> ⚠</span>}
            </button>
          ))}
        </div>
        {park ? <ParkCard park={park} /> : <p className="hint">Click a park on the map, or a letter above.</p>}
      </section>

      <Method analysis={analysis} />
    </aside>
  )
}

function Legend({ analysis, layer, selected }) {
  const { green } = analysis
  if (layer === 'time') {
    return (
      <section className="legend">
        <h2>Walking time to the nearest park <Tag kind="model" /></h2>
        {TIME_CLASSES.map((c) => <Swatch key={c.label} color={c.color} label={c.label} />)}
        <Swatch color={COLORS.notRouted} label={`not routed (water, or no street within ${MAX_SNAP_M} m)`} />
        <Common />
        <p className="note">
          Near the edge of the study area, a closer park outside it may exist, so times there may be too long.
        </p>
      </section>
    )
  }
  if (layer === 'catchment') {
    return (
      <section className="legend">
        <h2>{CATCHMENT_MIN}-minute catchments <Tag kind="model" /></h2>
        {selected == null ? (
          <>
            <Swatch color={COLORS.overlap[0]} label="within reach of 1 park" />
            <Swatch color={COLORS.overlap[1]} label="within reach of 2 parks" />
            <Swatch color={COLORS.overlap[2]} label="within reach of 3 parks" />
          </>
        ) : (
          <Swatch color={COLORS.catchSelected} label={`catchment of ${green.parks[selected].label}`} />
        )}
        <Common />
        <p className="note">
          Catchments overlap, so the residents shown for each park <strong>must not be added up</strong>: many people
          are counted for more than one park.
        </p>
      </section>
    )
  }
  const values = green.parks.map((p) => p.pressure.value).filter((v) => v != null)
  const range = [Math.min(...values), Math.max(...values)]
  return (
    <section className="legend">
      <h2>Potential pressure <Tag kind="model" /></h2>
      <p className="note">Estimated residents within a {CATCHMENT_MIN}-minute walk per hectare of park.</p>
      {[...green.parks].sort((a, b) => (b.pressure.value ?? -1) - (a.pressure.value ?? -1)).map((p) => (
        <Swatch key={p.label}
          color={p.pressure.value == null ? COLORS.unavailable : pressureColor(p.pressure.value, range)}
          label={`${p.label}: ${p.pressure.value == null ? 'not available' : `≈ ${fmt(p.pressure.rounded)} residents/ha`}${p.pressure.status === 'warning' ? ' ⚠' : ''}`} />
      ))}
      <Swatch color={COLORS.sports} label="likely sports ground (not analysed)" />
      <Swatch color={COLORS.smallGreen} label={`green under ${PARK_RULES.minAreaHa} ha (not analysed)`} />
      <p className="note">
        A proxy for <em>potential</em> demand from nearby residents, not visitor counts. It doesn’t say whether a
        park is actually crowded or quiet.
      </p>
    </section>
  )
}

function Common() {
  return (
    <>
      <Swatch color={COLORS.park} label={`park (recreation area ≥ ${PARK_RULES.minAreaHa} ha)`} />
      <Swatch color={COLORS.sports} label="likely sports ground (not counted as a park)" />
      <Swatch color={COLORS.smallGreen} label={`green under ${PARK_RULES.minAreaHa} ha (not analysed)`} />
    </>
  )
}

function Swatch({ color, label }) {
  return (
    <div className="swatch">
      <span style={{ background: color }} />
      {label}
    </div>
  )
}

function ParkCard({ park }) {
  const { residents, pressure } = park
  return (
    <div className="park-card">
      <h3>{park.label}</h3>
      {park.edge === 'near' && (
        <div className="warning" role="note">
          <strong>Likely underestimated due to incomplete boundary coverage.</strong> This green stops{' '}
          {Math.round(park.edgeDist)} m from the edge of the study area, and the data can’t show whether the park
          continues beyond it. The real park area and the resident count may both be larger, so the pressure value
          could be too high or too low.
        </div>
      )}
      {park.edge === 'cut' && (
        <div className="warning" role="note">
          <strong>Area unreliable.</strong> The outline is cut by the edge of the study area.
        </div>
      )}
      <dl>
        <dt>Name</dt>
        <dd>Not in the data (neutral label) <Tag kind="data" /></dd>

        <dt>Plots</dt>
        <dd>{park.plotIds.length} recreation plot{park.plotIds.length > 1 ? 's' : ''} (IDs {park.plotIds.join(', ')}) <Tag kind="data" /></dd>

        <dt>Area</dt>
        <dd>
          {park.areaHa.toFixed(2)} ha{park.edge !== 'none' ? ' inside the study area' : ''} <Tag kind="data" />
          <small>Measured from the plot outlines.</small>
        </dd>

        <dt>Residents within {CATCHMENT_MIN} min walk</dt>
        <dd>
          ≈ {fmt(residents.rounded)} <Tag kind="model" />
          <small>
            From {residents.cellsTouched} census cells (Zensus 2022, 100 m).
            {residents.nullCells > 0 && ` ${residents.nullCells} overlapping cell${residents.nullCells > 1 ? 's have' : ' has'} no published figure and ${residents.nullCells > 1 ? 'are' : 'is'} left out.`}
          </small>
        </dd>

        <dt>Potential pressure</dt>
        <dd>
          {pressure.value == null
            ? <>Not available <small>{pressure.reason}</small></>
            : <>≈ {fmt(pressure.rounded)} residents per ha of park <Tag kind="model" /></>}
        </dd>
      </dl>
      {pressure.warnings?.length > 0 && (
        <ul className="caveats">
          {pressure.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <p className="note">
        These are estimates of <em>potential</em> pressure from residents nearby, not visitor counts. The highlighted
        area on the map is this park’s modelled {CATCHMENT_MIN}-minute catchment.
      </p>
    </div>
  )
}

function Method({ analysis }) {
  const { green } = analysis
  return (
    <details className="method">
      <summary>How it’s calculated (and its limits)</summary>
      <ul>
        <li>
          <strong>Parks.</strong> The data has no “park” category and no names. Plots with land use “recreation” less
          than {PARK_RULES.mergeGapM} m apart are joined. Areas of {PARK_RULES.minAreaHa} ha or more count as parks
          ({green.parks.length} found). One area with {green.sports[0]?.sportBuildings ?? 0} sport buildings and no
          footpath through it is treated as a likely sports ground. Squares, cemeteries and water are not parks.
        </li>
        <li>
          <strong>Ways in.</strong> Without entrance data, every street node inside a park or within{' '}
          {PARK_RULES.accessM} m of its edge counts as a way in. Fences and opening hours are not known.
        </li>
        <li>
          <strong>Walking time.</strong> Shortest route along the pedestrian network at {WALK_M_PER_MIN} m per minute
          (4.8 km/h), plus a straight walk from each {GRID_M} m square to the nearest street (up to {MAX_SNAP_M} m).
          No slopes, crossings or waiting times.
        </li>
        <li>
          <strong>Catchment.</strong> Streets reachable within {CATCHMENT_M} m ({CATCHMENT_MIN} min), with a{' '}
          {BAND_M} m band on each side. The band is an approximation of where people live along those streets, not a
          verified pedestrian-access boundary.
        </li>
        <li>
          <strong>Residents.</strong> Each 100 m census cell adds its population × the share of the cell inside the
          catchment (measured with points every {SAMPLE_M} m). This assumes people are spread evenly within a cell.
          Cells without a published figure are left out and counted. Totals are rounded to 10.
        </li>
        <li>
          <strong>Edges.</strong> The study area is about 1.3 × 2 km, and a {CATCHMENT_MIN}-minute walk is{' '}
          {CATCHMENT_M} m. Catchments are cut off where the data ends, so resident counts near the edge are too low.
        </li>
      </ul>
    </details>
  )
}
