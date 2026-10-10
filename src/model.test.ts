import { describe, expect, it } from 'vitest'
import { analyse, convertAirUnit, convertSystem, DEFAULTS, type Inputs } from './model'

describe('analyse', () => {
  const a = analyse(DEFAULTS)
  it('sizes the main trunk near the design friction rate', () => {
    const m = a.sections[0]
    expect(m.shape).toBe('round')
    // 3000 m³/h at 1 Pa/m: about 400 mm
    expect(m.exactMm).toBeGreaterThan(360)
    expect(m.exactMm).toBeLessThan(430)
    expect(m.dMm).toBe(400)
    expect(m.rate).toBeGreaterThan(0.7)
    expect(m.rate).toBeLessThan(1.4)
    expect(m.velocity).toBeCloseTo(3000 / 3600 / (Math.PI * 0.04), 6)
  })
  it('sizes the rectangular branch from the fixed height', () => {
    const b = a.sections[1]
    expect(b.hMm).toBe(200)
    expect(b.wMm % 50).toBe(0)
    expect(b.deMm).toBeGreaterThan(b.exactMm * 0.85)
    expect(b.deMm).toBeLessThan(b.exactMm * 1.2)
  })
  it('sizes by velocity', () => {
    const c = a.sections[2]
    // 600 m³/h at 4 m/s → 0.1667/4 = 0.0417 m² → Ø230 mm; nearest standard 224
    expect(c.exactMm).toBeCloseTo(230.3, 0)
    expect(c.dMm).toBe(224)
  })
  it('adds up losses on the critical path plus other losses', () => {
    const path = a.sections.filter((s) => s.onPath).reduce((x, s) => x + s.loss, 0)
    expect(a.pathLoss).toBeCloseTo(path, 9)
    expect(a.fanPressure).toBeCloseTo(path + 80, 9)
    for (const s of a.sections) expect(s.loss).toBeCloseTo(s.lossFriction + s.lossFittings, 9)
  })
  it('flags velocities above the limit', () => {
    const hot: Inputs = { ...DEFAULTS, rate: 6 }
    expect(analyse(hot).sections[0].overLimit).toBe(true)
  })
})

describe('unit conversion', () => {
  it('keeps the physical design when switching to IP', () => {
    const ip = convertSystem(DEFAULTS, 'IP')
    const x = analyse(DEFAULTS).sections[0]
    const y = analyse(ip).sections[0]
    expect(y.exactMm).toBeCloseTo(x.exactMm, 0)
    expect(convertSystem(ip, 'SI').rate).toBeCloseTo(1, 2)
  })
  it('converts airflow units', () => {
    const l = convertAirUnit(DEFAULTS, 'L/s')
    expect(l.sections[0].flow).toBeCloseTo(833.3, 0)
    expect(analyse(l).sections[0].Q).toBeCloseTo(3000 / 3600, 3)
  })
})
