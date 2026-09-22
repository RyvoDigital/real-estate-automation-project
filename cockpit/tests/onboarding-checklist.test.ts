import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checklistFor, nurtureSoldFrom, type ChecklistInputs } from '../src/lib/onboarding-checklist'

/* Brief §2.8: no "onboarded" state while anything is outstanding; the two agency
   conversations are named when outstanding; a fact that could not be read is
   never done and never outstanding. */

const OTHER = '00000000-0000-0000-0000-00000000000b'
const base = (over: Partial<ChecklistInputs> = {}): ChecklistInputs => ({
  client: { id: 'c1', name: 'Marbella Sur', rehearsal: false, createdOn: '2026-09-22' },
  records: [],
  declaredOn: null,
  calibratedOn: null,
  nurtureSold: true,
  clientNames: new Map([[OTHER, 'Ryvo Test Client']]),
  ...over,
})
const routing = { step: 'routing_proved' as const, happenedOn: '2026-09-23', recordedBy: 'manuel', detail: { new_client_answered: true, existing_client_answered: true, existing_client_id: OTHER } }
const told = { step: 'ai_disclosure_told' as const, happenedOn: '2026-09-22', recordedBy: 'manuel', detail: { told: 'Ana, the owner' } }

test('S6, just created: four outstanding, NOT onboarded, and the headline names each, the two conversations included', () => {
  const c = checklistFor(base())
  assert.equal(c.onboarded, false)
  assert.deepEqual(c.outstanding.map((s) => s.key), ['routing', 'disclosure', 'declaration', 'calibration'])
  assert.match(c.headline, /^4 outstanding: the routing proof, /)
  assert.match(c.headline, /the contact declaration/)
  assert.match(c.headline, /the calibration/)
  assert.doesNotMatch(c.headline, /is onboarded/)
})

test('🔴 everything done but ONE conversation: still not onboarded, and that conversation is named', () => {
  for (const [missing, over, name] of [
    ['declaration', { declaredOn: null, calibratedOn: '2026-09-24' }, /1 outstanding: the contact declaration\./],
    ['calibration', { declaredOn: '2026-09-24', calibratedOn: null }, /1 outstanding: the calibration\./],
  ] as const) {
    const c = checklistFor(base({ records: [routing, told], ...over }))
    assert.equal(c.onboarded, false, missing)
    assert.deepEqual(c.outstanding.map((s) => s.key), [missing])
    assert.match(c.headline, name)
  }
})

test('everything done: onboarded, and only then', () => {
  const c = checklistFor(base({ records: [routing, told], declaredOn: '2026-09-24', calibratedOn: '2026-09-25' }))
  assert.equal(c.onboarded, true)
  assert.equal(c.headline, 'Marbella Sur is onboarded.')
  assert.ok(c.steps.every((s) => s.state === 'done'))
})

test('🔒 a fact that could not be READ is unknown: never done, never outstanding, never onboarded', () => {
  const c = checklistFor(base({ records: [routing, told], declaredOn: undefined, calibratedOn: '2026-09-25' }))
  assert.equal(c.onboarded, false)
  const d = c.steps.find((s) => s.key === 'declaration')!
  assert.equal(d.state, 'unknown')
  assert.match(c.headline, /could not be read/)
})

test('🔒 0054 not applied: routing and disclosure are unknown and say why, not outstanding', () => {
  const c = checklistFor(base({ records: 'not_migrated' }))
  for (const k of ['routing', 'disclosure'] as const) {
    const s = c.steps.find((x) => x.key === k)!
    assert.equal(s.state, 'unknown', k)
    assert.match(s.line, /migration 0054/)
  }
  assert.equal(c.onboarded, false)
})

test('the routing proof names BOTH halves when done', () => {
  const s = checklistFor(base({ records: [routing] })).steps.find((x) => x.key === 'routing')!
  assert.equal(s.state, 'done')
  assert.equal(s.on, '2026-09-23')
  assert.match(s.line, /this number answered as Marbella Sur, and Ryvo Test Client still answered as itself/)
})

test('the latest record of a step is the one shown (the view already drops superseded rows)', () => {
  const later = { ...told, happenedOn: '2026-09-23', detail: { told: 'Ana and Rui' } }
  const s = checklistFor(base({ records: [told, later] })).steps.find((x) => x.key === 'disclosure')!
  assert.equal(s.on, '2026-09-23')
  assert.match(s.line, /Told Ana and Rui, before they found it/)
})

test('the two agency conversations link out; the proofs and the disclosure are recorded here', () => {
  const byKey = Object.fromEntries(checklistFor(base()).steps.map((s) => [s.key, s]))
  assert.equal(byKey.declaration.href, '/segmentation')
  assert.equal(byKey.calibration.href, '/calibrate')
  assert.equal(byKey.routing.href, null)
  assert.equal(byKey.disclosure.href, null)
})

test('a rehearsal says so on its first step', () => {
  const s = checklistFor(base({ client: { id: 'c1', name: 'ZZ Demo', rehearsal: true, createdOn: '2026-09-22' } })).steps[0]
  assert.match(s.line, /rehearsal/)
})

// ── the calibration applies only where automation 03 was sold (operator, 22 Sep 2026) ──

const done = { records: [routing, told], declaredOn: '2026-09-24', calibratedOn: null }

test('🔴 a Concierge-only client is never shown the calibration as outstanding, and can be onboarded without it', () => {
  const c = checklistFor(base({ ...done, nurtureSold: false }))
  const cal = c.steps.find((s) => s.key === 'calibration')!
  assert.equal(cal.state, 'not_applicable')
  assert.equal(cal.href, null, 'no link to calibrate something that was not sold')
  assert.ok(!c.outstanding.some((s) => s.key === 'calibration'))
  assert.ok(!c.unknown.some((s) => s.key === 'calibration'))
  assert.equal(c.onboarded, true)
})

test('where nurture WAS sold, an uncalibrated client is outstanding exactly as before', () => {
  const c = checklistFor(base({ ...done, nurtureSold: true }))
  assert.deepEqual(c.outstanding.map((s) => s.key), ['calibration'])
  assert.equal(c.onboarded, false)
})

test('🔒 no contract in force, or contracts unread: unknown, never outstanding and never "not sold"', () => {
  for (const nurtureSold of [null, undefined]) {
    const c = checklistFor(base({ ...done, nurtureSold }))
    const cal = c.steps.find((s) => s.key === 'calibration')!
    assert.equal(cal.state, 'unknown', `nurtureSold=${nurtureSold}`)
    assert.equal(c.onboarded, false, 'a client is not onboarded on no evidence of what was sold')
  }
  assert.match(checklistFor(base({ ...done, nurtureSold: null })).steps[4].line, /No contract is recorded/)
  assert.match(checklistFor(base({ ...done, nurtureSold: undefined })).steps[4].line, /could not be read/)
})

test('🔴 "sold" comes from the contract in force, never from an automation row existing', () => {
  const today = '2026-09-22'
  assert.equal(nurtureSoldFrom([{ automations: ['inbound_concierge', 'lead_nurture'], endsOn: null }], today), true)
  assert.equal(nurtureSoldFrom([{ automations: ['inbound_concierge'], endsOn: null }], today), false)
  assert.equal(nurtureSoldFrom([], today), null, 'no contract: not known, not "not sold"')
  assert.equal(nurtureSoldFrom([{ automations: ['lead_nurture'], endsOn: '2026-09-01' }], today), null, 'an ended contract is not in force')
  assert.equal(nurtureSoldFrom([{ automations: ['lead_nurture'], endsOn: '2026-09-22' }], today), true, 'in force through its last day')
  assert.equal(nurtureSoldFrom([{ automations: ['lead_nurture'], endsOn: '2026-09-01' }, { automations: ['inbound_concierge'], endsOn: null }], today), false,
    'nurture sold once and ended, Concierge still running: not sold now')
  // The read never looks at client_automations for this: 0056 creates that row disabled at a first calibration.
  const read = readFileSync(new URL('../src/lib/onboarding-read.ts', import.meta.url), 'utf8')
  const fn = read.slice(read.indexOf('async function readContracts'), read.indexOf('export type OnboardingIndex'))
  assert.match(fn, /from\('client_contracts_uncorrected'\)/)
  assert.doesNotMatch(fn, /client_automations/)
})
