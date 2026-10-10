import { useMemo } from 'react'
import { CheckField, NumField, Section, SelectField, Shell, Stats, Verdict } from './kit'
import LineChart, { type Series } from './LineChart'
import { download, fmt, toCsv, usePersisted, usePrefs } from './kitlib'
import { AIRFLOW_UNITS, DUCT_MATERIALS, VELOCITY_LIMITS, equivalentDiameter, frictionRate, airProps, rectSide } from './lib/duct'
import { APPLICATION_LABEL, MATERIAL_LABEL, tr } from './i18n'
import { analyse, convertAirUnit, convertSystem, DEFAULTS, unitsOf, type Inputs, type Section as Sec, type System } from './model'

const KEY = 'hvac-duct-sizer:v1'

export default function App() {
  const { prefs, setPrefs, t } = usePrefs(KEY, tr)
  const [inp, update, reset] = usePersisted<Inputs>(KEY, DEFAULTS)
  const a = useMemo(() => analyse(inp), [inp])
  const u = unitsOf(inp.system)
  const setSec = (id: number, p: Partial<Sec>) => update((s) => ({ ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...p } : x)) }))
  const af = AIRFLOW_UNITS[inp.airUnit] ?? 1
  const maxV = Math.max(...a.sections.map((s) => (s.overLimit ? 1 : 0)))
  const eqDe = equivalentDiameter(inp.eqA, inp.eqB)
  const eqOther = rectSide(inp.eqD, inp.eqA)

  const chart = useMemo(() => {
    const air = airProps(inp.temp, inp.altitude)
    const eps = (DUCT_MATERIALS[inp.material] ?? 0.09) * 1e-3
    const qMaxSI = Math.max(...a.sections.map((s) => s.Q), 0.01) * 1.5
    const sizes = inp.system === 'SI' ? [100, 150, 200, 250, 315, 400, 500, 630, 800] : [4, 6, 8, 10, 12, 16, 20, 24, 32].map((x) => x * 25.4)
    const rateMax = Math.max(inp.rate * u.rateF * 4, ...a.sections.map((s) => s.rate * 1.1))
    const series: Series[] = sizes.map((d, i) => ({
      label: inp.system === 'SI' ? `Ø${d}` : `Ø${Math.round(d / 25.4)}"`,
      color: `hsl(${200 + i * 18} 60% ${50 - i}%)`,
      width: 1.6,
      pts: Array.from({ length: 41 }, (_, k): [number, number] => {
        const q = (qMaxSI * k) / 40
        return [q / af, frictionRate(Math.max(q, 1e-6), d / 1000, eps, air) / u.rateF]
      }),
    }))
    return { series, rateMax: rateMax / u.rateF, qMax: qMaxSI / af }
  }, [inp.temp, inp.altitude, inp.material, inp.system, inp.rate, a.sections, af, u.rateF])

  const sizeText = (s: (typeof a.sections)[number]) => {
    const f = (mm: number) => (inp.system === 'SI' ? fmt(mm, 4) : fmt(mm / 25.4, 3))
    return s.shape === 'round' ? `Ø${f(s.dMm)} ${u.size}` : `${f(s.wMm)} × ${f(s.hMm)} ${u.size}`
  }

  const exportCsv = () =>
    download('duct-sizes.csv', toCsv([[t('Section'), `${t('Airflow')} (${inp.airUnit})`, `${t('Exact size')} (mm)`, t('Selected size'), `${t('Velocity')} (${u.velocity})`, `${t('Loss per length')} (${u.rate})`, `${t('Section loss')} (${u.pressure})`], ...a.sections.map((s, i) => [s.name, inp.sections[i].flow, s.exactMm, sizeText(s), s.velocity / u.velF, s.rate / u.rateF, s.loss / u.pressF])]), 'text/csv')

  const side = (
    <>
      <Section title={t('Design basis')}>
        <div className="grid2">
          <SelectField<System> label={t('Unit system')} value={inp.system} onChange={(v) => update((s) => convertSystem(s, v))} options={[['SI', t('SI (m, mm, Pa)')], ['IP', t('Imperial (ft, in, in.wg)')]]} />
          <SelectField label={t('Airflow unit')} value={inp.airUnit} onChange={(v) => update((s) => convertAirUnit(s, v))} options={Object.keys(AIRFLOW_UNITS).map((k) => [k, k])} />
        </div>
        <NumField t={t} label={t('Design friction rate')} unit={u.rate} value={inp.rate} min={0.0001} onChange={(v) => update({ rate: v })} />
        <div className="grid2">
          <SelectField label={t('Application')} value={inp.application} onChange={(v) => update({ application: v })} options={Object.keys(VELOCITY_LIMITS).map((k): [string, string] => [k, t(APPLICATION_LABEL[k])])} />
          <SelectField label={t('Duct material')} value={inp.material} onChange={(v) => update({ material: v })} options={Object.keys(DUCT_MATERIALS).map((k): [string, string] => [k, t(MATERIAL_LABEL[k])])} />
          <NumField t={t} label={t('Air temperature')} unit="°C" value={inp.temp} min={-40} max={120} onChange={(v) => update({ temp: v })} />
          <NumField t={t} label={t('Altitude')} unit="m" value={inp.altitude} min={-400} max={5000} onChange={(v) => update({ altitude: v })} />
        </div>
        <NumField t={t} label={t('Other losses on the critical path (coil, filter, grilles)')} unit={u.pressure} value={inp.otherLoss} min={0} onChange={(v) => update({ otherLoss: v })} />
      </Section>
      <Section
        title={t('Sections')}
        actions={
          <button className="small" onClick={() => update((s) => ({ ...s, nextId: s.nextId + 1, sections: [...s.sections, { id: s.nextId, name: `${t('Section')} ${s.sections.length + 1}`, flow: s.sections[s.sections.length - 1]?.flow ?? 1000, length: 10, kind: 'branch', shape: 'round', sizing: 'friction', velocity: inp.system === 'SI' ? 4 : 800, height: 0, aspect: 2, K: 1, onPath: false }] }))}>
            {t('Add section')}
          </button>
        }
      >
        {inp.sections.map((s) => (
          <div className="card" key={s.id}>
            <div className="row">
              <input aria-label={t('Name')} value={s.name} onChange={(e) => setSec(s.id, { name: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
              <button className="small danger" disabled={inp.sections.length < 2} onClick={() => update((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== s.id) }))}>{t('Remove')}</button>
            </div>
            <div className="grid2">
              <NumField t={t} label={t('Airflow')} unit={inp.airUnit} value={s.flow} min={0.001} onChange={(v) => setSec(s.id, { flow: v })} />
              <NumField t={t} label={t('Length')} unit={u.length} value={s.length} min={0} onChange={(v) => setSec(s.id, { length: v })} />
              <SelectField<'main' | 'branch'> label={t('Type')} value={s.kind} onChange={(v) => setSec(s.id, { kind: v })} options={[['main', t('Main')], ['branch', t('Branch')]]} />
              <SelectField<'round' | 'rect'> label={t('Shape')} value={s.shape} onChange={(v) => setSec(s.id, { shape: v })} options={[['round', t('Round')], ['rect', t('Rectangular')]]} />
              <SelectField<'friction' | 'velocity'> label={t('Sizing basis')} value={s.sizing} onChange={(v) => setSec(s.id, { sizing: v })} options={[['friction', t('Equal friction')], ['velocity', t('Target velocity')]]} />
              {s.sizing === 'velocity' ? <NumField t={t} label={t('Target velocity')} unit={u.velocity} value={s.velocity} min={0.1} onChange={(v) => setSec(s.id, { velocity: v })} /> : <div />}
              {s.shape === 'rect' ? (
                <>
                  <NumField t={t} label={t('Fixed height (0 = use aspect ratio)')} unit={u.size} value={s.height} min={0} onChange={(v) => setSec(s.id, { height: v })} />
                  <NumField t={t} label={t('Max aspect ratio')} value={s.aspect} min={1} max={10} onChange={(v) => setSec(s.id, { aspect: v })} />
                </>
              ) : null}
              <NumField t={t} label={t('Fittings loss coefficient C (sum)')} value={s.K} min={0} onChange={(v) => setSec(s.id, { K: v })} />
            </div>
            <CheckField label={t('On the critical path')} value={s.onPath} onChange={(v) => setSec(s.id, { onPath: v })} />
          </div>
        ))}
      </Section>
      <Section title={t('Equivalent diameter')}>
        <p className="hint">{t('Rectangular → round')}</p>
        <div className="grid2">
          <NumField t={t} label={t('Side a')} unit={u.size} value={inp.eqA} min={1} onChange={(v) => update({ eqA: v })} />
          <NumField t={t} label={t('Side b')} unit={u.size} value={inp.eqB} min={1} onChange={(v) => update({ eqB: v })} />
        </div>
        <p className="hint"><strong>{t('Equivalent round diameter')}: {fmt(eqDe, 4)} {u.size}</strong></p>
        <p className="hint">{t('Round → rectangular')}</p>
        <NumField t={t} label={t('Round diameter')} unit={u.size} value={inp.eqD} min={1} onChange={(v) => update({ eqD: v })} />
        <p className="hint"><strong>{eqOther === null ? t('No rectangle with this side can match that diameter.') : `${t('Other side b')} (a = ${fmt(inp.eqA, 4)}): ${fmt(eqOther, 4)} ${u.size}`}</strong></p>
      </Section>
    </>
  )

  return (
    <Shell title={t('HVAC Duct Sizer')} tagline={t('Equal-friction duct sizing with round and rectangular sections.')} repo="hvac-duct-sizer" prefs={prefs} setPrefs={setPrefs} t={t} state={inp} onReset={reset} side={side}
      footer={t('Huebscher: De = 1.30 (ab)^0.625 / (a+b)^0.25. Friction by Darcy-Weisbach with Colebrook. Sizes are rounded to standard sizes.')}>
      <Stats
        items={[
          { label: t('Critical path loss'), value: fmt(a.pathLoss / u.pressF, 4), unit: u.pressure },
          { label: t('Fan total pressure needed'), value: fmt(a.fanPressure / u.pressF, 4), unit: u.pressure },
          { label: t('Max airflow'), value: fmt(a.totalFlow / af, 4), unit: inp.airUnit },
        ]}
      />
      <div className="box">
        <Verdict tone={maxV ? 'warn' : 'ok'}>{maxV ? t('Some sections exceed the recommended velocity: enlarge them or lower the friction rate.') : t('All velocities are within the recommended limits.')}</Verdict>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('Section')}</th>
                <th className="num">{t('Airflow')} ({inp.airUnit})</th>
                <th className="num">{t('Exact size')}</th>
                <th>{t('Selected size')}</th>
                <th className="num">{t('Velocity')} ({u.velocity})</th>
                <th className="num">{t('Loss per length')} ({u.rate})</th>
                <th className="num">{t('Friction')} ({u.pressure})</th>
                <th className="num">{t('Fittings')} ({u.pressure})</th>
                <th className="num">{t('Section loss')} ({u.pressure})</th>
                <th>{t('Notes')}</th>
              </tr>
            </thead>
            <tbody>
              {a.sections.map((s, i) => (
                <tr key={s.id}>
                  <td>{s.name}{s.onPath ? ' ●' : ''}</td>
                  <td className="num">{fmt(inp.sections[i].flow, 4)}</td>
                  <td className="num">{inp.system === 'SI' ? fmt(s.exactMm, 4) : fmt(s.exactMm / 25.4, 3)} {u.size}</td>
                  <td><strong>{sizeText(s)}</strong></td>
                  <td className="num">{fmt(s.velocity / u.velF, 3)}</td>
                  <td className="num">{fmt(s.rate / u.rateF, 3)}</td>
                  <td className="num">{fmt(s.lossFriction / u.pressF, 3)}</td>
                  <td className="num">{fmt(s.lossFittings / u.pressF, 3)}</td>
                  <td className="num"><strong>{fmt(s.loss / u.pressF, 3)}</strong></td>
                  <td className={s.overLimit || s.problem ? 'warn-text' : ''}>
                    {s.overLimit ? t('Velocity above {0} {1}', fmt(s.limit / u.velF, 3), u.velocity) : ''}
                    {s.problem ? t('Fixed side too large: used a square duct') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="small" onClick={exportCsv}>{t('Export CSV')}</button>
          <button className="small" onClick={() => download('duct-sizer.json', JSON.stringify({ inputs: inp, result: a }, null, 2), 'application/json')}>{t('Export JSON')}</button>
          <button className="small" onClick={() => window.print()}>{t('Print')}</button>
        </div>
      </div>
      <div className="box">
        <h3>{t('Friction rate vs airflow')}</h3>
        <LineChart
          title={t('Friction chart')} t={t} exportName="duct-friction-chart.svg" xLabel={t('Airflow ({0})', inp.airUnit)} yLabel={t('Loss ({0})', u.rate)} xMax={chart.qMax} yMax={chart.rateMax} series={chart.series}
          markers={a.sections.map((s) => ({ x: s.Q / af, y: s.rate / u.rateF, label: s.name, color: s.overLimit ? 'var(--warn)' : 'var(--accent)' }))}
        />
      </div>
    </Shell>
  )
}
