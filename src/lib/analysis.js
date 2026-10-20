// The analysis: walking time to the nearest park, each park's 15-minute
// catchment, the residents estimated inside it, and the potential pressure index.
import { bboxOf, makeBuckets, distToSegment, makeProjection, pointInPolygon, polygonArea } from './geo.js'
import { findGreenSpaces } from './parks.js'
import { buildNetwork, distanceFromPoint, reachedPieces, shortestDistances, WALK_M_PER_MIN } from './routing.js'

export const CATCHMENT_MIN = 15
export const CATCHMENT_M = CATCHMENT_MIN * WALK_M_PER_MIN // 1200 m
export const BAND_M = 25 // band on each side of a reached street: an approximation, not a surveyed access boundary
export const GRID_M = 10 // size of the squares in the walking-time layer
export const SAMPLE_M = 5 // spacing of the sample points used to share census cells out
export const EDGE_WARN_M = 50 // a catchment reaching this close to the study-area edge is probably cut off

export function runAnalysis({ kit, plots, buildings, graph, zensus }) {
  const proj = makeProjection(kit.center)
  const [w, s] = proj.toXY([kit.bbox[0], kit.bbox[1]])
  const [e, n] = proj.toXY([kit.bbox[2], kit.bbox[3]])
  const rect = { minX: w, minY: s, maxX: e, maxY: n }

  const net = buildNetwork(graph, proj)
  const green = findGreenSpaces({ plots, buildings, net, proj, rect })
  const water = plots.features
    .filter((f) => /water/.test(f.properties.landuse))
    .map((f) => f.geometry.coordinates.map((r) => r.map(proj.toXY)))
  const census = prepareCensus(zensus, proj)

  const grid = walkingTimeGrid({ net, parks: green.parks, water, rect })
  for (const park of green.parks) {
    park.catchment = catchment(net, park, rect)
    park.residents = estimateResidents(census, park.catchment.inside)
    park.pressure = potentialPressure(park)
  }
  return { proj, rect, net, green, water, census, grid }
}

// ---------- Layer 1: walking time to the nearest park ----------

export function walkingTimeGrid({ net, parks, water, rect }) {
  const sources = parks.flatMap((p) => p.access.map((node) => ({ node, label: p.index })))
  const result = shortestDistances(net, sources)
  const cols = Math.ceil((rect.maxX - rect.minX) / GRID_M)
  const rows = Math.ceil((rect.maxY - rect.minY) / GRID_M)
  const minutes = new Float32Array(cols * rows).fill(NaN) // NaN = not routed
  const park = new Int8Array(cols * rows).fill(-1)
  const reason = new Uint8Array(cols * rows) // 0 routed, 1 no street within 100 m, 2 water
  const waterBoxes = water.map(bboxOf)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const p = cellCentre(rect, c, r) // row 0 is the north edge
      const inWater = water.some(
        (rings, k) =>
          p[0] >= waterBoxes[k].minX && p[0] <= waterBoxes[k].maxX &&
          p[1] >= waterBoxes[k].minY && p[1] <= waterBoxes[k].maxY && pointInPolygon(p, rings),
      )
      if (inWater) {
        reason[i] = 2
        continue
      }
      const inPark = parks.find((pk) => pk.inside(p))
      if (inPark) {
        minutes[i] = 0
        park[i] = inPark.index
        continue
      }
      const d = distanceFromPoint(net, result, p)
      if (!d) {
        reason[i] = 1
        continue
      }
      minutes[i] = d.metres / WALK_M_PER_MIN
      park[i] = d.label
    }
  }
  return { cols, rows, size: GRID_M, minutes, park, reason }
}

export function cellCentre(rect, c, r, size = GRID_M) {
  return [rect.minX + (c + 0.5) * size, rect.maxY - (r + 0.5) * size]
}

// ---------- Layer 2: catchments and residents ----------

// The streets reachable from a park's ways in within 15 minutes, with a
// 25 m band on each side, plus the park itself.
export function catchment(net, park, rect) {
  const sources = park.access.map((node) => ({ node, label: park.index }))
  const result = shortestDistances(net, sources, CATCHMENT_M)
  const pieces = reachedPieces(net, result, CATCHMENT_M)
  const buckets = makeBuckets(
    pieces,
    ([a, b]) => ({
      minX: Math.min(a[0], b[0]),
      minY: Math.min(a[1], b[1]),
      maxX: Math.max(a[0], b[0]),
      maxY: Math.max(a[1], b[1]),
    }),
    50,
  )
  const inside = (p) => {
    for (const idx of buckets.near(p[0], p[1], BAND_M)) {
      const [a, b] = pieces[idx]
      if (distToSegment(p, a, b).d <= BAND_M) return true
    }
    return park.inside(p)
  }
  let edgeDist = Infinity
  for (const piece of pieces) {
    for (const [x, y] of piece) {
      edgeDist = Math.min(edgeDist, x - rect.minX, rect.maxX - x, y - rect.minY, rect.maxY - y)
    }
  }
  return { pieces, inside, reachesEdge: edgeDist <= EDGE_WARN_M, edgeDist }
}

// Sample points every 5 m inside each census cell, computed once.
export function prepareCensus(zensus, proj) {
  return zensus.features.map((f) => {
    const rings = f.geometry.coordinates.map((r) => r.map(proj.toXY))
    const b = bboxOf(rings)
    const samples = []
    for (let x = b.minX + SAMPLE_M / 2; x < b.maxX; x += SAMPLE_M) {
      for (let y = b.minY + SAMPLE_M / 2; y < b.maxY; y += SAMPLE_M) {
        if (pointInPolygon([x, y], rings)) samples.push([x, y])
      }
    }
    return { id: f.properties.id, population: f.properties.population, rings, areaM2: polygonArea(rings), samples }
  })
}

// Area-weighted estimate: every cell adds its population times the share of
// the cell that lies inside the catchment. Residents are assumed to be spread
// evenly over the cell. Cells with no published figure (null) are left out and counted.
export function estimateResidents(census, inside) {
  let sum = 0
  let cellsTouched = 0
  let nullCells = 0
  for (const cell of census) {
    let k = 0
    for (const p of cell.samples) if (inside(p)) k++
    if (k === 0) continue
    cellsTouched++
    if (cell.population == null) {
      nullCells++
      continue
    }
    sum += cell.population * (k / cell.samples.length)
  }
  return { raw: sum, rounded: Math.round(sum / 10) * 10, cellsTouched, nullCells }
}

// ---------- Layer 3: potential pressure ----------

// Estimated residents within a 15-minute walk per hectare of park.
// A proxy for potential demand, not a count of visitors.
export function potentialPressure(park) {
  if (park.access.length === 0) {
    return { value: null, status: 'unavailable', reason: 'No street reaches this area, so it has no catchment.' }
  }
  if (park.edge === 'cut') {
    return {
      value: null,
      status: 'unavailable',
      reason:
        'The plot outline is cut by the study-area edge, so the measured area is not the whole park. ' +
        'Dividing by it would give a misleading value.',
    }
  }
  const value = park.residents.raw / park.areaHa
  const warnings = []
  if (park.edge === 'near') {
    warnings.push(
      `The park stops ${Math.round(park.edgeDist)} m from the study-area edge, and the data can’t show whether ` +
        'it continues beyond it. Its area and catchment may be larger in reality.',
    )
  }
  if (park.catchment.reachesEdge) {
    warnings.push(
      'The 15-minute catchment reaches the study-area edge. Streets and residents beyond it are not in the data, ' +
        'so the resident count is likely too low.',
    )
  }
  return {
    value,
    rounded: Math.round(value / 10) * 10,
    status: warnings.length ? 'warning' : 'ok',
    warnings,
  }
}

// Mask of one catchment at 5 m, for drawing. Row 0 is the north edge.
export function catchmentMask(rect, inside, size = SAMPLE_M) {
  const cols = Math.ceil((rect.maxX - rect.minX) / size)
  const rows = Math.ceil((rect.maxY - rect.minY) / size)
  const data = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (inside(cellCentre(rect, c, r, size))) data[r * cols + c] = 1
    }
  }
  return { cols, rows, data }
}
