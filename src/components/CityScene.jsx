// The 3D map: ground layers, parks, buildings and streets.
// Scene axes: x = metres east, y = up, z = metres south (so north is -z).
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MapControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { catchmentMask } from '../lib/analysis.js'
import { COLORS, TIME_CLASSES, pressureColor, timeClass } from './colors.js'

export default function CityScene({ analysis, buildings, layer, selected, onSelect, onHover }) {
  const { rect } = analysis
  const cx = (rect.minX + rect.maxX) / 2
  const cy = (rect.minY + rect.maxY) / 2
  const labelRefs = useRef([])
  const parks = analysis.green.parks
  return (
    <>
    <Canvas
      camera={{ position: [cx, 2250, -cy + 1450], fov: 40, near: 5, far: 20000 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={[COLORS.sky]} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[-600, 1200, 400]} intensity={1.6} />
      <Ground analysis={analysis} layer={layer} selected={selected} onSelect={onSelect} onHover={onHover} />
      <GreenSpaces analysis={analysis} layer={layer} selected={selected} onSelect={onSelect} onHover={onHover} />
      <Buildings analysis={analysis} buildings={buildings} />
      <Streets analysis={analysis} />
      <MapControls target={[cx, 0, -cy + 120]} maxPolarAngle={Math.PI / 2.3} minDistance={80} maxDistance={4500} />
      <LabelPositions parks={parks} refs={labelRefs} />
    </Canvas>
    <div className="map-labels">
      {parks.map((p) => (
        <ParkLabel key={p.label} park={p} layer={layer} selected={selected === p.index} onSelect={onSelect}
          ref={(el) => (labelRefs.current[p.index] = el)} />
      ))}
    </div>
    </>
  )
}

// Pale ground plus one picture laid over it: walking times, or catchments.
function Ground({ analysis, layer, selected, onSelect, onHover }) {
  const { rect, grid, green } = analysis
  const w = rect.maxX - rect.minX
  const h = rect.maxY - rect.minY
  const pos = [(rect.minX + rect.maxX) / 2, 0, -(rect.minY + rect.maxY) / 2]

  const timeTexture = useMemo(() => {
    const data = new Uint8Array(grid.cols * grid.rows * 4)
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const i = r * grid.cols + c
        const m = grid.minutes[i]
        const [cr, cg, cb] = hexToRGB(Number.isNaN(m) ? COLORS.notRouted : TIME_CLASSES[timeClass(m)].color)
        const o = ((grid.rows - 1 - r) * grid.cols + c) * 4 // textures start at the bottom (south)
        data[o] = cr
        data[o + 1] = cg
        data[o + 2] = cb
        data[o + 3] = Number.isNaN(m) ? 140 : 215
      }
    }
    return makeTexture(data, grid.cols, grid.rows, THREE.NearestFilter)
  }, [grid])

  // How many parks' catchments cover each 5 m point (computed once).
  const masks = useMemo(() => green.parks.map((p) => catchmentMask(rect, p.catchment.inside)), [green, rect])

  const catchTexture = useMemo(() => {
    const { cols, rows } = masks[0]
    const data = new Uint8Array(cols * rows * 4)
    const sel = selected == null ? null : masks[selected]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const o = ((rows - 1 - r) * cols + c) * 4
        let color = null
        let alpha = 0
        if (sel) {
          if (sel.data[i]) {
            color = COLORS.catchSelected
            alpha = 120
          }
        } else if (layer === 'catchment') {
          const n = masks.reduce((s, m) => s + m.data[i], 0)
          if (n) {
            color = COLORS.overlap[Math.min(n, 3) - 1]
            alpha = 150
          }
        }
        if (color) {
          const [cr, cg, cb] = hexToRGB(color)
          data[o] = cr
          data[o + 1] = cg
          data[o + 2] = cb
          data[o + 3] = alpha
        }
      }
    }
    return makeTexture(data, cols, rows, THREE.LinearFilter)
  }, [masks, selected, layer])

  const last = useRef(-1)
  const handleMove = (e) => {
    const x = e.point.x
    const y = -e.point.z
    const c = Math.floor((x - rect.minX) / grid.size)
    const r = Math.floor((rect.maxY - y) / grid.size)
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return
    const i = r * grid.cols + c
    if (i === last.current) {
      onHover((h) => h && { ...h, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
      return
    }
    last.current = i
    onHover({ kind: 'ground', index: i, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
  }

  const overlay = layer === 'time' ? timeTexture : catchTexture
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={pos}>
        <planeGeometry args={[w + 400, h + 400]} />
        <meshBasicMaterial color={COLORS.outside} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[pos[0], 0.05, pos[2]]}
        onPointerMove={handleMove}
        onPointerOut={() => {
          last.current = -1
          onHover(null)
        }}
        onClick={(e) => e.delta < 4 && onSelect(null)}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={COLORS.ground} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[pos[0], 0.2, pos[2]]} renderOrder={1}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={overlay} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

// '#1f6f5c' -> [31, 111, 92], the sRGB bytes the texture expects
function hexToRGB(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function makeTexture(data, cols, rows, filter) {
  const t = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat)
  t.magFilter = filter
  t.minFilter = filter
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

// Parks (analysed), the likely sports ground and small greens (drawn only).
function GreenSpaces({ analysis, layer, selected, onSelect, onHover }) {
  const { green } = analysis
  const pressures = green.parks.map((p) => p.pressure.value).filter((v) => v != null)
  const range = [Math.min(...pressures), Math.max(...pressures)]

  const parkColor = (p) => {
    if (layer === 'pressure') return p.pressure.value == null ? COLORS.unavailable : pressureColor(p.pressure.value, range)
    return COLORS.park
  }

  return (
    <group>
      {green.small.map((a, i) => (
        <Area key={`s${i}`} area={a} color={COLORS.smallGreen} y={0.4} opacity={0.85}
          onHover={(e) => onHover({ kind: 'small', area: a, x: e.clientX, y: e.clientY })} onLeave={() => onHover(null)} />
      ))}
      {green.sports.map((a, i) => (
        <Area key={`x${i}`} area={a} color={COLORS.sports} y={0.4} opacity={0.9}
          onHover={(e) => onHover({ kind: 'sports', area: a, x: e.clientX, y: e.clientY })} onLeave={() => onHover(null)} />
      ))}
      {green.parks.map((p) => (
        <group key={p.label}>
          <Area area={p} color={parkColor(p)} y={0.5} opacity={selected === p.index ? 1 : 0.92}
            outline={selected === p.index}
            onClick={() => onSelect(p.index)}
            onHover={(e) => onHover({ kind: 'park', park: p, x: e.clientX, y: e.clientY })}
            onLeave={() => onHover(null)} />
        </group>
      ))}
    </group>
  )
}

function Area({ area, color, y, opacity, outline, onClick, onHover, onLeave }) {
  const geometry = useMemo(() => {
    const parts = area.polygons.map((rings) => {
      const shape = new THREE.Shape(rings[0].map(([x, yy]) => new THREE.Vector2(x, yy)))
      shape.holes = rings.slice(1).map((r) => new THREE.Path(r.map(([x, yy]) => new THREE.Vector2(x, yy))))
      const g = new THREE.ShapeGeometry(shape)
      g.rotateX(-Math.PI / 2)
      return g
    })
    return mergeGeometries(parts)
  }, [area])
  const edges = useMemo(() => {
    const pts = []
    for (const rings of area.polygons) {
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          pts.push(ring[i][0], 0, -ring[i][1], ring[i + 1][0], 0, -ring[i + 1][1])
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [area])

  return (
    <group position-y={y}>
      <mesh
        geometry={geometry}
        renderOrder={2}
        onClick={(e) => {
          if (!onClick || e.delta > 4) return
          e.stopPropagation()
          onClick()
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          onHover?.(e.nativeEvent)
        }}
        onPointerOut={() => onLeave?.()}
      >
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} renderOrder={3}>
        <lineBasicMaterial color={outline ? COLORS.selectedOutline : COLORS.parkEdge} transparent depthWrite={false} />
      </lineSegments>
    </group>
  )
}

// Where to put a park's label: the middle of its most detailed plot.
function labelAnchor(park) {
  let best = park.polygons[0][0]
  for (const rings of park.polygons) if (rings[0].length > best.length) best = rings[0]
  const n = best.length - 1
  let x = 0, y = 0
  for (const [px, py] of best.slice(0, -1)) {
    x += px
    y += py
  }
  return new THREE.Vector3(x / n, 20, -y / n)
}

// Every frame, moves the label buttons (plain HTML over the map) to their parks' screen positions.
function LabelPositions({ parks, refs }) {
  const anchors = useMemo(() => parks.map(labelAnchor), [parks])
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    anchors.forEach((a, i) => {
      const el = refs.current[i]
      if (!el) return
      v.copy(a).project(camera)
      const hidden = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1
      el.style.display = hidden ? 'none' : ''
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    })
  })
  return null
}

function ParkLabel({ park, layer, selected, onSelect, ref }) {
  const letter = park.label.slice(-1)
  let value = null
  if (layer === 'catchment') value = `≈ ${park.residents.rounded.toLocaleString('en-GB')} residents`
  if (layer === 'pressure') {
    value = park.pressure.value == null
      ? 'pressure n/a'
      : `≈ ${park.pressure.rounded.toLocaleString('en-GB')} res./ha`
  }
  const warn = park.edge !== 'none'
  return (
    <button ref={ref} className={`map-label${selected ? ' is-selected' : ''}`} onClick={() => onSelect(park.index)}>
      <strong>{letter}</strong>
      {value && <span>{value}</span>}
      {warn && <span className="map-label-warn" title="Near the study-area edge: see panel">⚠</span>}
    </button>
  )
}

// All buildings merged into one mesh so the view stays smooth.
function Buildings({ analysis, buildings }) {
  const { proj } = analysis
  const geometry = useMemo(() => {
    const parts = []
    for (const f of buildings.features) {
      const rings = f.geometry.coordinates.map((r) => r.map(proj.toXY))
      const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)))
      shape.holes = rings.slice(1).map((r) => new THREE.Path(r.map(([x, y]) => new THREE.Vector2(x, y))))
      const g = new THREE.ExtrudeGeometry(shape, { depth: f.properties.height, bevelEnabled: false })
      g.rotateX(-Math.PI / 2) // extrusion now points up, shape north points to -z
      g.deleteAttribute('uv')
      parts.push(g)
    }
    const merged = mergeGeometries(parts)
    parts.forEach((g) => g.dispose())
    return merged
  }, [buildings, proj])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={COLORS.building} />
    </mesh>
  )
}

function Streets({ analysis }) {
  const geometry = useMemo(() => {
    const pts = []
    for (const e of analysis.net.edges) pts.push(e.pa[0], 0, -e.pa[1], e.pb[0], 0, -e.pb[1])
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [analysis])
  return (
    <lineSegments geometry={geometry} position-y={0.7} renderOrder={4}>
      <lineBasicMaterial color={COLORS.street} transparent opacity={0.75} depthWrite={false} />
    </lineSegments>
  )
}
