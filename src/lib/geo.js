// Geometry helpers. Every distance and area in the app goes through these,
// so the whole analysis uses one coordinate system: metres east (x) and
// north (y) of the kit centre.

// GRS80 / WGS84 ellipsoid. Using its local radii (instead of a sphere)
// makes the 100 m census cells come out at 10,000 m², as they should.
const A = 6378137
const E2 = 0.00669438

export function makeProjection([lon0, lat0]) {
  const phi = (lat0 * Math.PI) / 180
  const w = Math.sqrt(1 - E2 * Math.sin(phi) ** 2)
  const N = A / w // radius across (east–west)
  const M = (A * (1 - E2)) / w ** 3 // radius along the meridian (north–south)
  const kx = (N * Math.cos(phi) * Math.PI) / 180 // metres per degree of longitude
  const ky = (M * Math.PI) / 180 // metres per degree of latitude
  return {
    toXY: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky],
    toLonLat: ([x, y]) => [lon0 + x / kx, lat0 + y / ky],
  }
}

// Shoelace formula; rings are [[x, y], ...] with the first point repeated at the end.
export function ringArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(a) / 2
}

// A polygon is [outer ring, hole, hole, ...].
export function polygonArea(rings) {
  return ringArea(rings[0]) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0)
}

export function pointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function pointInPolygon(p, rings) {
  return pointInRing(p, rings[0]) && !rings.slice(1).some((r) => pointInRing(p, r))
}

// Distance from point p to the segment a–b, and how far along it (t from 0 to 1) the closest point is.
export function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return { d: Math.hypot(px - ax - t * dx, py - ay - t * dy), t }
}

export function distToRing(p, ring) {
  let m = Infinity
  for (let i = 0; i < ring.length - 1; i++) m = Math.min(m, distToSegment(p, ring[i], ring[i + 1]).d)
  return m
}

// 0 inside the polygon, otherwise the distance to its edge.
export function distToPolygon(p, rings) {
  if (pointInPolygon(p, rings)) return 0
  return Math.min(...rings.map((r) => distToRing(p, r)))
}

export function bboxOf(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rings) {
    for (const [x, y] of r) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

// Turns a list of items into a grid of buckets, so "what is near this point?"
// only looks at a few items instead of all of them.
export function makeBuckets(items, getBox, size) {
  const map = new Map()
  const key = (i, j) => i * 100003 + j
  items.forEach((item, idx) => {
    const b = getBox(item)
    for (let i = Math.floor(b.minX / size); i <= Math.floor(b.maxX / size); i++) {
      for (let j = Math.floor(b.minY / size); j <= Math.floor(b.maxY / size); j++) {
        const k = key(i, j)
        if (!map.has(k)) map.set(k, [])
        map.get(k).push(idx)
      }
    }
  })
  return {
    // indexes of items whose box lies within r metres of (x, y)
    near(x, y, r) {
      const out = new Set()
      for (let i = Math.floor((x - r) / size); i <= Math.floor((x + r) / size); i++) {
        for (let j = Math.floor((y - r) / size); j <= Math.floor((y + r) / size); j++) {
          const list = map.get(key(i, j))
          if (list) for (const idx of list) out.add(idx)
        }
      }
      return out
    },
  }
}
