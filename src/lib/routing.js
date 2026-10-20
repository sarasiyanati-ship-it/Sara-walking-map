// The walking network and shortest-path search.
import { distToSegment, makeBuckets } from './geo.js'

export const WALK_M_PER_MIN = 80 // 4.8 km/h, as in prompt.md
export const MAX_SNAP_M = 100 // a place further than this from any street is not routed

// Turns streets.graph.json into a structure that is quick to search.
// Edge lengths come from the data (`length`, metres); positions only place points along an edge.
export function buildNetwork(graph, proj) {
  const index = new Map()
  const nodes = graph.nodes.map((n, i) => {
    index.set(n.id, i)
    const [x, y] = proj.toXY([n.lon, n.lat])
    return { id: n.id, x, y }
  })
  const adj = nodes.map(() => [])
  const edges = graph.edges
    .filter((e) => e.walkable !== false)
    .map((e) => {
      const a = index.get(e.from)
      const b = index.get(e.to)
      adj[a].push({ to: b, len: e.length })
      adj[b].push({ to: a, len: e.length }) // edges can be walked both ways
      return {
        id: e.id,
        a,
        b,
        len: e.length,
        pa: [nodes[a].x, nodes[a].y],
        pb: [nodes[b].x, nodes[b].y],
      }
    })
  const buckets = makeBuckets(
    edges,
    (e) => ({
      minX: Math.min(e.pa[0], e.pb[0]),
      minY: Math.min(e.pa[1], e.pb[1]),
      maxX: Math.max(e.pa[0], e.pb[0]),
      maxY: Math.max(e.pa[1], e.pb[1]),
    }),
    50,
  )
  return { nodes, adj, edges, buckets }
}

// The closest point on any street within MAX_SNAP_M, or null.
export function snapToNetwork(net, p, maxR = MAX_SNAP_M) {
  let best = null
  for (const idx of net.buckets.near(p[0], p[1], maxR)) {
    const e = net.edges[idx]
    const { d, t } = distToSegment(p, e.pa, e.pb)
    if (d <= maxR && (!best || d < best.d)) best = { edge: e, d, t }
  }
  return best
}

// Dijkstra from several start nodes at once. Each source is { node, label }.
// Returns, for every node, the shortest walking distance (metres) to the
// nearest source and that source's label (-1 if never reached).
export function shortestDistances(net, sources, maxD = Infinity) {
  const n = net.nodes.length
  const dist = new Float64Array(n).fill(Infinity)
  const label = new Int32Array(n).fill(-1)
  const heap = new MinHeap()
  for (const s of sources) {
    if (dist[s.node] > 0) {
      dist[s.node] = 0
      label[s.node] = s.label
      heap.push(0, s.node)
    }
  }
  while (heap.size) {
    const [d, u] = heap.pop()
    if (d > dist[u] || d > maxD) continue
    for (const { to, len } of net.adj[u]) {
      const nd = d + len
      if (nd < dist[to]) {
        dist[to] = nd
        label[to] = label[u]
        heap.push(nd, to)
      }
    }
  }
  return { dist, label }
}

// Walking distance from point p to the nearest source:
// a straight walk to the closest street, then along the street to either end of that edge.
export function distanceFromPoint(net, result, p) {
  const snap = snapToNetwork(net, p)
  if (!snap) return null
  const { edge, d, t } = snap
  const viaA = result.dist[edge.a] + t * edge.len
  const viaB = result.dist[edge.b] + (1 - t) * edge.len
  if (!Number.isFinite(viaA) && !Number.isFinite(viaB)) return null
  return viaA <= viaB
    ? { metres: d + viaA, label: result.label[edge.a], snap: d }
    : { metres: d + viaB, label: result.label[edge.b], snap: d }
}

// The parts of every street that can be reached within maxD metres,
// including the reachable part of the last street (from one or both ends).
export function reachedPieces(net, result, maxD) {
  const pieces = []
  const lerp = (e, t) => [e.pa[0] + (e.pb[0] - e.pa[0]) * t, e.pa[1] + (e.pb[1] - e.pa[1]) * t]
  for (const e of net.edges) {
    const ra = Math.max(0, maxD - result.dist[e.a]) // metres walkable into the edge from end a
    const rb = Math.max(0, maxD - result.dist[e.b]) // ... and from end b
    if (ra + rb >= e.len) {
      pieces.push([e.pa, e.pb])
    } else {
      if (ra > 0) pieces.push([e.pa, lerp(e, ra / e.len)])
      if (rb > 0) pieces.push([lerp(e, 1 - rb / e.len), e.pb])
    }
  }
  return pieces
}

class MinHeap {
  constructor() {
    this.k = []
    this.v = []
  }
  get size() {
    return this.k.length
  }
  push(key, val) {
    const { k, v } = this
    let i = k.length
    k.push(key)
    v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= key) break
      k[i] = k[p]
      v[i] = v[p]
      i = p
    }
    k[i] = key
    v[i] = val
  }
  pop() {
    const { k, v } = this
    const top = [k[0], v[0]]
    const lk = k.pop()
    const lv = v.pop()
    if (k.length) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= k.length) break
        if (c + 1 < k.length && k[c + 1] < k[c]) c++
        if (k[c] >= lk) break
        k[i] = k[c]
        v[i] = v[c]
        i = c
      }
      k[i] = lk
      v[i] = lv
    }
    return top
  }
}
