// Finds parks in plots.geojson. The data has no "park" category and no names,
// so the rule below is a decision of this project, written out so it can be checked.
import { bboxOf, distToPolygon, pointInPolygon, polygonArea } from './geo.js'

export const PARK_RULES = {
  landuse: 'recreation', // the only green land use in the kit
  mergeGapM: 10, // recreation plots closer than this (usually a footpath apart) form one area
  minAreaHa: 0.5, // smaller areas are drawn but not analysed
  sportBuildingsMin: 3, // an area with this many `sport` buildings and no footpath through it
  // is treated as a likely sports ground, not a public park
  accessM: 10, // street nodes inside or within this distance of a park are its ways in
  edgeCutM: 1, // a park with a corner this close to the study-area edge is cut by it
  edgeNearM: 50, // a park this close to the edge may continue outside it
}

// rect: the study area in metres { minX, minY, maxX, maxY }
export function findGreenSpaces({ plots, buildings, net, proj, rect }) {
  const rec = plots.features
    .filter((f) => f.properties.landuse === PARK_RULES.landuse)
    .map((f) => {
      const rings = f.geometry.coordinates.map((r) => r.map(proj.toXY))
      return { id: f.properties.id, rings, area: polygonArea(rings), box: bboxOf(rings) }
    })

  // Group plots that are less than mergeGapM apart (union–find).
  const parent = rec.map((_, i) => i)
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])))
  const gap = (A, B) => {
    let m = Infinity
    for (const p of A.rings[0]) m = Math.min(m, distToPolygon(p, B.rings))
    for (const p of B.rings[0]) m = Math.min(m, distToPolygon(p, A.rings))
    return m
  }
  const g = PARK_RULES.mergeGapM
  for (let i = 0; i < rec.length; i++) {
    for (let j = i + 1; j < rec.length; j++) {
      const a = rec[i].box
      const b = rec[j].box
      if (a.minX - g > b.maxX || b.minX - g > a.maxX || a.minY - g > b.maxY || b.minY - g > a.maxY) continue
      if (gap(rec[i], rec[j]) <= g) parent[root(i)] = root(j)
    }
  }
  const groups = new Map()
  rec.forEach((r, i) => {
    const k = root(i)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  })

  const bCentroids = buildings.features.map((f) => {
    const ring = f.geometry.coordinates[0].map(proj.toXY)
    const n = ring.length - 1
    let x = 0, y = 0
    for (let i = 0; i < n; i++) {
      x += ring[i][0]
      y += ring[i][1]
    }
    return { p: [x / n, y / n], use: f.properties.use }
  })

  const areas = [...groups.values()].map((plotsIn) => {
    const polygons = plotsIn.map((p) => p.rings)
    const inside = (p) => polygons.some((rings) => pointInPolygon(p, rings))
    const areaM2 = plotsIn.reduce((s, p) => s + p.area, 0)
    const blds = bCentroids.filter((b) => inside(b.p))
    const sportBuildings = blds.filter((b) => b.use === 'sport').length
    // street length whose midpoint lies inside the area: are there paths through it?
    const pathLength = net.edges
      .filter((e) => inside([(e.pa[0] + e.pb[0]) / 2, (e.pa[1] + e.pb[1]) / 2]))
      .reduce((s, e) => s + e.len, 0)
    // closest corner to the study-area edge
    let edgeDist = Infinity
    for (const rings of polygons) {
      for (const [x, y] of rings[0]) {
        edgeDist = Math.min(edgeDist, x - rect.minX, rect.maxX - x, y - rect.minY, rect.maxY - y)
      }
    }
    const access = []
    net.nodes.forEach((n, i) => {
      if (polygons.some((rings) => distToPolygon([n.x, n.y], rings) <= PARK_RULES.accessM)) access.push(i)
    })

    let kind = 'park'
    if (areaM2 / 1e4 < PARK_RULES.minAreaHa) kind = 'small'
    else if (sportBuildings >= PARK_RULES.sportBuildingsMin && pathLength === 0) kind = 'sports'

    return {
      plotIds: plotsIn.map((p) => p.id).sort((a, b) => a - b),
      polygons,
      inside,
      areaHa: areaM2 / 1e4,
      buildings: blds.length,
      sportBuildings,
      pathLength,
      edgeDist,
      edge: edgeDist <= PARK_RULES.edgeCutM ? 'cut' : edgeDist <= PARK_RULES.edgeNearM ? 'near' : 'none',
      access,
      kind,
    }
  })

  // Neutral labels A, B, C... by size, largest first.
  const parks = areas.filter((a) => a.kind === 'park').sort((a, b) => b.areaHa - a.areaHa)
  parks.forEach((p, i) => {
    p.index = i
    p.label = `Green area ${String.fromCharCode(65 + i)}`
  })
  return {
    parks,
    sports: areas.filter((a) => a.kind === 'sports'),
    small: areas.filter((a) => a.kind === 'small'),
  }
}
