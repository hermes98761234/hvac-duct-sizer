import { airProps, diameterForFriction, diameterForVelocity, dynamicPressure, equivalentDiameter, frictionRate, nearestRound, rectHeightForAspect, rectSide, roundArea, roundTo, AIRFLOW_UNITS, DUCT_MATERIALS, FRICTION_UNITS, ROUND_SIZES_MM, VELOCITY_LIMITS } from './lib/duct'

export type System = 'SI' | 'IP'

export interface Section {
  id: number
  name: string
  flow: number
  length: number
  kind: 'main' | 'branch'
  shape: 'round' | 'rect'
  sizing: 'friction' | 'velocity'
  /** Target velocity in the system's velocity unit (m/s or fpm). */
  velocity: number
  /** Fixed rectangular height in the system's size unit (mm or in); 0 = use the aspect ratio. */
  height: number
  aspect: number
  /** Sum of fitting loss coefficients C. */
  K: number
  onPath: boolean
}

export interface Inputs {
  system: System
  airUnit: string
  /** Design friction rate in the system unit (Pa/m or in.wg/100ft). */
  rate: number
  application: string
  material: string
  temp: number
  altitude: number
  /** Extra losses on the critical path (coil, filter, grilles), Pa or in.wg. */
  otherLoss: number
  sections: Section[]
  eqA: number
  eqB: number
  eqD: number
  nextId: number
}

export const DEFAULTS: Inputs = {
  system: 'SI',
  airUnit: 'm³/h',
  rate: 1,
  application: 'commercial',
  material: 'galvanized',
  temp: 20,
  altitude: 0,
  otherLoss: 80,
  eqA: 400,
  eqB: 200,
  eqD: 315,
  nextId: 10,
  sections: [
    { id: 1, name: 'Main trunk', flow: 3000, length: 18, kind: 'main', shape: 'round', sizing: 'friction', velocity: 6, height: 0, aspect: 2, K: 0.9, onPath: true },
    { id: 2, name: 'Branch A', flow: 1200, length: 10, kind: 'branch', shape: 'rect', sizing: 'friction', velocity: 4, height: 200, aspect: 2, K: 1.2, onPath: true },
    { id: 3, name: 'Branch B', flow: 600, length: 6, kind: 'branch', shape: 'round', sizing: 'velocity', velocity: 4, height: 0, aspect: 2, K: 0.7, onPath: false },
  ],
}

const IN = 0.0254
const FT = 0.3048
const FPM = 0.00508
const IN_WG = 249.0889

export const unitsOf = (s: System) =>
  s === 'SI'
    ? { length: 'm', size: 'mm', velocity: 'm/s', rate: 'Pa/m', pressure: 'Pa', lengthF: 1, sizeF: 0.001, velF: 1, rateF: 1, pressF: 1, step: 50 }
    : { length: 'ft', size: 'in', velocity: 'fpm', rate: 'in.wg/100ft', pressure: 'in.wg', lengthF: FT, sizeF: IN, velF: FPM, rateF: FRICTION_UNITS['in.wg/100ft'], pressF: IN_WG, step: 25.4 }

const sig = (x: number) => Number(x.toPrecision(4))

export function convertSystem(i: Inputs, to: System): Inputs {
  if (i.system === to) return i
  const a = unitsOf(i.system)
  const b = unitsOf(to)
  const c = (x: number, fa: number, fb: number) => sig((x * fa) / fb)
  return {
    ...i,
    system: to,
    rate: c(i.rate, a.rateF, b.rateF),
    otherLoss: c(i.otherLoss, a.pressF, b.pressF),
    eqA: c(i.eqA, a.sizeF, b.sizeF),
    eqB: c(i.eqB, a.sizeF, b.sizeF),
    eqD: c(i.eqD, a.sizeF, b.sizeF),
    sections: i.sections.map((s) => ({ ...s, length: c(s.length, a.lengthF, b.lengthF), velocity: c(s.velocity, a.velF, b.velF), height: c(s.height, a.sizeF, b.sizeF) })),
  }
}

export function convertAirUnit(i: Inputs, to: string): Inputs {
  const r = (AIRFLOW_UNITS[i.airUnit] ?? 1) / (AIRFLOW_UNITS[to] ?? 1)
  return { ...i, airUnit: to, sections: i.sections.map((s) => ({ ...s, flow: sig(s.flow * r) })) }
}

const IP_ROUND_IN = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 54, 60]

export interface SectionResult {
  id: number
  name: string
  Q: number
  /** Exact round / equivalent diameter before standardising, mm. */
  exactMm: number
  /** Chosen size in mm: round diameter, or rectangle height and width. */
  shape: 'round' | 'rect'
  dMm: number
  hMm: number
  wMm: number
  deMm: number
  velocity: number
  rate: number
  lossFriction: number
  lossFittings: number
  loss: number
  limit: number
  overLimit: boolean
  problem: 'side' | null
  onPath: boolean
}

export interface Analysis {
  sections: SectionResult[]
  pathLoss: number
  fanPressure: number
  totalFlow: number
}

export function analyse(i: Inputs): Analysis {
  const u = unitsOf(i.system)
  const air = airProps(i.temp, i.altitude)
  const eps = (DUCT_MATERIALS[i.material] ?? 0.09) * 1e-3
  const rate = i.rate * u.rateF
  const lim = VELOCITY_LIMITS[i.application] ?? VELOCITY_LIMITS.commercial
  const roundSizes = i.system === 'SI' ? ROUND_SIZES_MM : IP_ROUND_IN.map((x) => x * 25.4)
  const sections = i.sections.map((s): SectionResult => {
    const Q = s.flow * (AIRFLOW_UNITS[i.airUnit] ?? 1)
    const vT = s.velocity * u.velF
    let exact = s.sizing === 'friction' ? diameterForFriction(Q, rate, eps, air) : diameterForVelocity(Q, vT)
    exact = Math.max(exact, 0.02)
    let dMm = 0
    let hMm = 0
    let wMm = 0
    let de = 0
    let area = 0
    let problem: 'side' | null = null
    if (s.shape === 'round') {
      dMm = nearestRound(exact * 1000, roundSizes)
      de = dMm / 1000
      area = roundArea(de)
    } else {
      const fixedH = s.height * u.sizeF
      let h: number
      let w: number
      if (s.sizing === 'friction') {
        if (fixedH > 0) {
          const other = rectSide(exact, fixedH)
          h = fixedH
          w = other ?? fixedH
          if (other === null) problem = 'side'
        } else {
          h = rectHeightForAspect(exact, Math.max(1, s.aspect))
          w = h * Math.max(1, s.aspect)
        }
      } else {
        const A = Q / vT
        if (fixedH > 0) {
          h = fixedH
          w = A / h
        } else {
          h = Math.sqrt(A / Math.max(1, s.aspect))
          w = A / h
        }
      }
      const step = u.step / 1000
      hMm = roundTo(h * 1000, step * 1000)
      wMm = roundTo(w * 1000, step * 1000)
      de = equivalentDiameter(hMm / 1000, wMm / 1000)
      area = (hMm / 1000) * (wMm / 1000)
    }
    const v = Q / area
    const r = frictionRate(Q, de, eps, air)
    const lossFriction = r * s.length * u.lengthF
    const lossFittings = s.K * dynamicPressure(v, air)
    const limit = s.kind === 'main' ? lim.main : lim.branch
    return { id: s.id, name: s.name, Q, exactMm: exact * 1000, shape: s.shape, dMm, hMm, wMm, deMm: de * 1000, velocity: v, rate: r, lossFriction, lossFittings, loss: lossFriction + lossFittings, limit, overLimit: v > limit, problem, onPath: s.onPath }
  })
  const pathLoss = sections.filter((s) => s.onPath).reduce((a, s) => a + s.loss, 0)
  return { sections, pathLoss, fanPressure: pathLoss + i.otherLoss * u.pressF, totalFlow: sections.filter((s) => s.onPath).reduce((m, s) => Math.max(m, s.Q), 0) }
}
