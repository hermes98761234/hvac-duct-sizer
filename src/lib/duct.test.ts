import { describe, expect, it } from 'vitest'
import { AIRFLOW_UNITS, airProps, diameterForFriction, diameterForVelocity, dynamicPressure, equivalentDiameter, frictionRate, FRICTION_UNITS, nearestRound, rectHeightForAspect, rectSide, roundTo } from './duct'

const air = airProps(20)
const eps = 0.09e-3

describe('air', () => {
  it('density at 20 °C', () => expect(air.rho).toBeCloseTo(1.204, 2))
  it('density falls with altitude', () => expect(airProps(20, 2000).rho).toBeLessThan(0.95))
})

describe('equivalent diameter (Huebscher)', () => {
  it('is the diameter for a square duct of the same friction', () => {
    expect(equivalentDiameter(300, 300)).toBeCloseTo(327.9, 0)
  })
  it('gives about 305 mm for 400×200', () => {
    expect(equivalentDiameter(400, 200)).toBeCloseTo(304.6, 0)
  })
  it('is symmetric and inverted by rectSide', () => {
    expect(equivalentDiameter(250, 500)).toBeCloseTo(equivalentDiameter(500, 250), 9)
    const b = rectSide(equivalentDiameter(250, 500), 250)!
    expect(b).toBeCloseTo(500, 6)
    expect(rectSide(500, 10)).toBeNull()
  })
  it('height for an aspect ratio', () => {
    const h = rectHeightForAspect(400, 2)
    expect(equivalentDiameter(h, 2 * h)).toBeCloseTo(400, 6)
  })
})

describe('friction', () => {
  it('equal-friction sizing returns the requested rate', () => {
    const Q = 1000 / 3600
    const D = diameterForFriction(Q, 1, eps, air)
    expect(frictionRate(Q, D, eps, air)).toBeCloseTo(1, 6)
    // ASHRAE chart: 1000 m³/h at 1 Pa/m is roughly a 250 mm duct
    expect(D * 1000).toBeGreaterThan(220)
    expect(D * 1000).toBeLessThan(280)
  })
  it('a smaller duct gives a higher rate', () => {
    const Q = 0.3
    expect(frictionRate(Q, 0.2, eps, air)).toBeGreaterThan(frictionRate(Q, 0.3, eps, air))
  })
  it('velocity sizing and dynamic pressure', () => {
    const D = diameterForVelocity(0.5, 5)
    expect(D).toBeCloseTo(0.3568, 3)
    expect(dynamicPressure(5, air)).toBeCloseTo(15.05, 1)
  })
})

describe('helpers', () => {
  it('standard sizes', () => {
    expect(nearestRound(268)).toBe(280)
    expect(nearestRound(250)).toBe(250)
    expect(roundTo(212, 50)).toBe(200)
    expect(roundTo(10, 50)).toBe(50)
  })
  it('units', () => {
    expect(1000 * AIRFLOW_UNITS['m³/h']).toBeCloseTo(0.2778, 4)
    expect(0.1 * FRICTION_UNITS['in.wg/100ft']).toBeCloseTo(0.817, 2)
    expect(AIRFLOW_UNITS.cfm * 1000).toBeCloseTo(0.4719, 3)
  })
})
