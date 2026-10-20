import { useEffect, useState } from 'react'
import CityScene from './components/CityScene.jsx'
import Panel, { Tag } from './components/Panel.jsx'
import { runAnalysis } from './lib/analysis.js'
import { PARK_RULES } from './lib/parks.js'

// Every data file is loaded through BASE_URL so the app works on localhost and on GitHub Pages.
const FILES = {
  kit: 'kit.json',
  plots: 'plots.geojson',
  buildings: 'buildings.geojson',
  graph: 'streets.graph.json',
  zensus: 'zensus.geojson',
}

// Worded as in public/data/SOURCES.md.
const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, ' +
  'InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).'

export default function App() {
  const [data, setData] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)
  const [layer, setLayer] = useState('time')
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    Promise.all(
      Object.entries(FILES).map(([key, file]) =>
        fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => {
          if (!r.ok) throw new Error(`data/${file}: ${r.status}`)
          return r.json().then((json) => [key, json])
        }),
      ),
    )
      .then((entries) => setData(Object.fromEntries(entries)))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!data) return
    // let the "Calculating…" message paint before the analysis runs
    const t = setTimeout(() => {
      try {
        setAnalysis(runAnalysis(data))
      } catch (e) {
        setError(e.message)
      }
    }, 30)
    return () => clearTimeout(t)
  }, [data])

  if (error) return <p className="status error">Something went wrong: {error}</p>
  if (!analysis) return <p className="status">{data ? 'Calculating walking times…' : 'Loading the city data…'}</p>

  return (
    <div className="app">
      <Panel analysis={analysis} layer={layer} setLayer={setLayer} selected={selected} onSelect={setSelected} />
      <main className="map">
        <CityScene analysis={analysis} buildings={data.buildings} layer={layer} selected={selected}
          onSelect={setSelected} onHover={setHover} />
        <p className="controls-hint">Drag to pan · right-drag to tilt and turn · scroll to zoom</p>
        <p className="attribution">{ATTRIBUTION}</p>
        {hover && <Tooltip hover={hover} analysis={analysis} />}
      </main>
    </div>
  )
}

function Tooltip({ hover, analysis }) {
  let body = null
  if (hover.kind === 'ground') {
    const { grid, green } = analysis
    const m = grid.minutes[hover.index]
    if (Number.isNaN(m)) {
      body = grid.reason[hover.index] === 2 ? 'Water: not routed' : 'No street within 100 m: not routed'
    } else {
      const p = green.parks[grid.park[hover.index]]
      body = m === 0
        ? <>Inside {p.label}</>
        : <>≈ {Math.max(1, Math.round(m))} min walk to {p.label} <Tag kind="model" /></>
    }
  } else if (hover.kind === 'park') {
    body = <>{hover.park.label} · {hover.park.areaHa.toFixed(2)} ha · click for details</>
  } else if (hover.kind === 'sports') {
    body = <>Recreation area, likely sports ground ({hover.area.sportBuildings} sport buildings, no footpath through it). Not counted as a park.</>
  } else if (hover.kind === 'small') {
    body = <>Small green space, {(hover.area.areaHa * 1e4).toFixed(0)} m². Under {PARK_RULES.minAreaHa} ha, not analysed.</>
  }
  if (!body) return null
  return (
    <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      {body}
    </div>
  )
}
