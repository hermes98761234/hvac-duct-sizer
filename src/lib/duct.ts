import { ATM, colebrook } from './pipe'

/** Duct maths in SI: m, m³/s, Pa. */

export interface Air {
  rho: number
  mu: number
}

export function airProps(tC: number, altitude = 0): Air {
  const T = tC + 273.15
  const P = ATM * (1 - 2.25577e-5 * altitude) ** 5.25588
  return { rho: P / (287.05 * T), mu: 1.716e-5 * (T / 273.15) ** 1.5 * (273.15 + 110.4) / (T + 110.4) }
}

/** Absolute roughness in mm. */
export const DUCT_MATERIALS: Record<string, number> = {
  galvanized: 0.09,
  aluminium: 0.05,
  stainless: 0.05,
  pvc: 0.01,
  fibreglass: 0.9,
  flex: 3,
  concrete: 1.5,
}

export const roundArea = (D: number) => (Math.PI * D * D) / 4

/** Darcy friction loss in Pa/m of a round duct. */
export function frictionRate(Q: number, D: number, epsM: number, air: Air): number {
  if (Q <= 0 || D <= 0) return 0
  const v = Q / roundArea(D)
  const Re = (air.rho * v * D) / air.mu
  const f = Re < 2300 ? 64 / Re : Re < 4000 ? 64 / 2300 + ((colebrook(4000, epsM / D) - 64 / 2300) * (Re - 2300)) / 1700 : colebrook(Re, epsM / D)
  return (f / D) * 0.5 * air.rho * v * v
}

/** Round diameter (m) giving the design friction rate (Pa/m) at flow Q. */
export function diameterForFriction(Q: number, rate: number, epsM: number, air: Air): number {
  let lo = 0.02
  let hi = 4
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (frictionRate(Q, mid, epsM, air) > rate) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export const diameterForVelocity = (Q: number, v: number) => Math.sqrt((4 * Q) / (Math.PI * v))

/** Huebscher equivalent round diameter for equal friction and flow. */
export const equivalentDiameter = (a: number, b: number) => (1.3 * (a * b) ** 0.625) / (a + b) ** 0.25

/** Other side b (same units as De and a) for a rectangle with equivalent diameter De; null if impossible. */
export function rectSide(De: number, a: number): number | null {
  if (!(De > 0) || !(a > 0)) return null
  let lo = a * 0.05
  let hi = a * 400
  if (equivalentDiameter(a, hi) < De) return null
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (equivalentDiameter(a, mid) < De) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Height h of a rectangle with width = aspect·h and equivalent diameter De (linear in h). */
export const rectHeightForAspect = (De: number, aspect: number) => De / (1.3 * aspect ** 0.625 * (1 + aspect) ** -0.25)

export const ROUND_SIZES_MM = [80, 100, 125, 150, 160, 180, 200, 224, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1600]

export function nearestRound(Dmm: number, sizes = ROUND_SIZES_MM): number {
  return sizes.reduce((best, s) => (Math.abs(s - Dmm) < Math.abs(best - Dmm) ? s : best), sizes[0])
}
export const roundTo = (x: number, step: number) => Math.max(step, Math.round(x / step) * step)

export interface Limits {
  main: number
  branch: number
}
/** Recommended maximum velocities in m/s. */
export const VELOCITY_LIMITS: Record<string, Limits> = {
  residential: { main: 5, branch: 3.5 },
  commercial: { main: 8, branch: 5 },
  industrial: { main: 12, branch: 9 },
}

export const dynamicPressure = (v: number, air: Air) => 0.5 * air.rho * v * v

export const AIRFLOW_UNITS: Record<string, number> = { 'm³/h': 1 / 3600, 'L/s': 1e-3, 'm³/s': 1, cfm: 0.00047194745 }
export const FRICTION_UNITS: Record<string, number> = { 'Pa/m': 1, 'in.wg/100ft': 249.0889 / 30.48 }
