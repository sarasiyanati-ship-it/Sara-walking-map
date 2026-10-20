// One place for every colour, so the map and the legend always agree.
import * as THREE from 'three'

export const COLORS = {
  sky: '#eef0ec',
  outside: '#e4e3dc', // beyond the study area: no data
  ground: '#f6f4ef',
  building: '#d9d6cf',
  street: '#8a8780',
  park: '#4f8a5b',
  parkEdge: '#2f5e3a',
  selectedOutline: '#111111',
  smallGreen: '#b9d3a9',
  sports: '#d3d0c7',
  notRouted: '#9a9a9a',
  unavailable: '#b5b5b5',
  overlap: ['#cfdcf0', '#94b2de', '#5a82c2'], // inside 1, 2, 3 parks' catchments
  catchSelected: '#2f5fb3',
  pressureLow: '#f7c59a',
  pressureHigh: '#b4441a',
}

// Walking time to the nearest park (minutes), a single-hue scale: darker = closer.
export const TIME_CLASSES = [
  { label: '0–5 min', max: 5, color: '#1f6f5c' },
  { label: '5–10 min', max: 10, color: '#5ea88f' },
  { label: '10–15 min', max: 15, color: '#b3d8c6' },
  { label: 'more than 15 min', max: Infinity, color: '#ecd8ae' },
]

export function timeClass(minutes) {
  return TIME_CLASSES.findIndex((c) => minutes < c.max)
}

// Pressure on a log scale between the lowest and highest value shown.
export function pressureColor(value, [min, max]) {
  const t = max > min ? (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min)) : 1
  return '#' + new THREE.Color(COLORS.pressureLow).lerp(new THREE.Color(COLORS.pressureHigh), t).getHexString()
}
