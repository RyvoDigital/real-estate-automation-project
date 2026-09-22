/*
 * The calibration's write path: /calibrate rebuild, checkpoint 1 (22 Sep 2026).
 * Every path through calibrate-core.ts, with a fake record_calibration that
 * behaves like 0056's: one call, the record and the projection or neither, and
 * the primary key refusing the same form twice.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  recordCalibration, parseAnswers, parseNumber, NO_ID, NO_NAME, SAME_PERSON, NO_NURTURE, ONE_CALIBRATION_KEY,
  type CalibrateDeps, type CalibrationForm,
} from '../src/lib/matching/calibrate-core'

const ID = '11111111-2222-4333-8444-555555555555'
const ID2 = '11111111-2222-4333-8444-666666666666'
const ME = 'manuel@ryvodigital.com'

/** 0056 as a fake: records by id; the same id again is 23505 on the pkey; the config is the latest sitting. */
function store(opts: { noNurture?: boolean; failWith?: string } = {}) {
  const records = new Map<string, unknown>()
  let config: Record<string, unknown> = { listing_ingest: { kept: true } }
  const calls: unknown[] = []
  const deps: CalibrateDeps = {
    record: async (args) => {
      calls.push(args)
      if (opts.failWith) return { data: null, error: { code: '23514', message: opts.failWith } }
      if (opts.noNurture) return { data: null, error: { code: 'P0002', message: 'record_calibration: this client has no lead_nurture automation row' } }
      if (records.has(args.p_calibration_id)) {
        return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${ONE_CALIBRATION_KEY}"` } }
      }
      records.set(args.p_calibration_id, args)
      config = { ...config, ...args.p_thresholds, calibration: { answered_by: args.p_answered_by } }
      return { data: '2026-09-22T15:00:00Z', error: null }
    },
  }
  return { deps, calls, records, config: () => config }
}

const form = (over: Partial<CalibrationForm> = {}): CalibrationForm => ({
  calibrationId: ID, clientId: 'c1', answeredBy: 'Marta Soares',
  budgetSaid: '2.000.000', budgetMost: '2.100.000', budgetStretchMost: '2 300 000', showsOneFewerBedroom: 'yes',
  ofHowMany: '5', strongAtLeast: '4', possibleAtLeast: '3', adjacency: 'Cascais: Estoril, Parede', ...over,
})

test('🔒 a complete sitting is ONE call with the answers, the six numbers, and both people', async () => {
  const s = store()
  const r = await recordCalibration(form(), ME, s.deps)
  assert.deepEqual(r, { ok: true, alreadyRecorded: false, recordedAt: '2026-09-22T15:00:00Z' })
  assert.equal(s.calls.length, 1)
  const a = s.calls[0] as Record<string, unknown>
  assert.equal(a.p_answered_by, 'Marta Soares')
  assert.equal(a.p_recorded_by, ME)
  assert.deepEqual(Object.keys(a.p_thresholds as object).sort(),
    ['area_adjacency', 'bedrooms_tolerance', 'budget_stretch', 'budget_stretch_with_evidence', 'min_score_possible', 'min_score_strong'])
  assert.equal((a.p_thresholds as { budget_stretch: number }).budget_stretch, 0.05)
  assert.deepEqual((a.p_answers as { budgetSaid: number }).budgetSaid, 2000000)
})

test('🔴 KEPT, NOT OVERWRITTEN: a second sitting is a second record, and the first survives', async () => {
  const s = store()
  await recordCalibration(form(), ME, s.deps)
  await recordCalibration(form({ calibrationId: ID2, answeredBy: 'Rui Antunes', budgetMost: '2.200.000' }), ME, s.deps)
  assert.equal(s.records.size, 2)
  assert.equal((s.config() as { budget_stretch: number }).budget_stretch, 0.1, 'the latest sitting is in force')
  assert.deepEqual((s.config() as { listing_ingest: unknown }).listing_ingest, { kept: true }, 'no other key lost')
})

test('🔴 the same form sent again is "already recorded": nothing new, not a failure', async () => {
  const s = store()
  await recordCalibration(form(), ME, s.deps)
  const again = await recordCalibration(form({ budgetMost: '2.200.000' }), ME, s.deps)
  assert.deepEqual(again, { ok: true, alreadyRecorded: true })
  assert.equal(s.records.size, 1)
  assert.equal((s.config() as { budget_stretch: number }).budget_stretch, 0.05, 'the resubmission changed nothing')
})

test('another unique violation is a failure, never mistaken for "already recorded"', async () => {
  const deps: CalibrateDeps = { record: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "some_other"' } }) }
  const r = await recordCalibration(form(), ME, deps)
  assert.equal(r.ok, false)
})

test('🔒 THE AGENCY ANSWERS, WE RECORD: no name, or our own name, is refused before the store', async () => {
  for (const [answeredBy, reason, me] of [[null, NO_NAME, ME], ['   ', NO_NAME, ME], [ME, SAME_PERSON, ME], [' Manuel@RyvoDigital.com ', SAME_PERSON, ME],
    // the operator's NAME typed as the answerer is us answering too (lib/operators.ts)
    ['Manuel Vale', SAME_PERSON, 'manuelvale@ryvodigital.com'], [' manuel vale ', SAME_PERSON, 'manuelvale@ryvodigital.com']] as const) {
    const s = store()
    assert.deepEqual(await recordCalibration(form({ answeredBy }), me, s.deps), { ok: false, kind: 'refused', reason })
    assert.equal(s.calls.length, 0)
  }
})

test('🔒 no calibration id, or a malformed one, is refused before the store', async () => {
  for (const calibrationId of [null, '', 'cal-1']) {
    const s = store()
    assert.deepEqual(await recordCalibration(form({ calibrationId }), ME, s.deps), { ok: false, kind: 'refused', reason: NO_ID })
    assert.equal(s.calls.length, 0)
  }
})

test('🔴 NOTHING IS ASSUMED: an empty field is null, never 0; an unanswered yes/no is null, never "no"', async () => {
  assert.equal(parseNumber(''), null)
  assert.equal(parseNumber(null), null)
  assert.equal(parseNumber('abc'), null)
  assert.equal(parseNumber('2.100.000'), 2100000)
  assert.equal(parseNumber('€2 100 000'), 2100000)
  for (const b of [null, '', 'sim', 'true']) assert.equal(parseAnswers(form({ showsOneFewerBedroom: b })).showsOneFewerBedroom, null)
  assert.equal(parseAnswers(form({ showsOneFewerBedroom: 'no' })).showsOneFewerBedroom, false)

  const s = store()
  const r = await recordCalibration(form({ budgetMost: '', showsOneFewerBedroom: '' }), ME, s.deps)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.kind, 'problems')
  const fields = r.ok === false && r.kind === 'problems' ? r.problems.map((p) => p.field) : []
  assert.ok(fields.includes('budgetMost') && fields.includes('showsOneFewerBedroom'), 'each missing answer is refused by NAME')
  assert.equal(s.calls.length, 0, 'a refusal writes nothing')
})

test('a client with nothing to calibrate is refused in words, and a database refusal says nothing was recorded', async () => {
  assert.deepEqual(await recordCalibration(form(), ME, store({ noNurture: true }).deps), { ok: false, kind: 'refused', reason: NO_NURTURE })
  const r = await recordCalibration(form(), ME, store({ failWith: 'violates check constraint "x"' }).deps)
  assert.equal(r.ok === false && r.kind === 'refused' && /nothing was recorded/.test(r.reason), true)
})

test('the key the core recognises is the one 0056 creates, and the rpc it calls exists there', () => {
  const mig = readFileSync(join(import.meta.dirname, '..', '..', 'db', 'migrations', '0056_calibration_records.sql'), 'utf8')
  assert.match(mig, /create table public\.calibration_records \(\n  id uuid primary key,/, 'the id is the primary key, so its constraint is calibration_records_pkey')
  assert.match(mig, /create function public\.record_calibration\(/)
  const action = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'matching', 'calibrate-actions.ts'), 'utf8')
  assert.match(action, /rpc\('record_calibration', args\)/)
})

test('🔒 the core cannot write any other way, and nothing in the cockpit writes a calibration but the rpc', () => {
  const core = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'matching', 'calibrate-core.ts'), 'utf8')
  assert.doesNotMatch(core, /supabase|admin\(|server-only|\.from\(/, 'the core reaches a database itself')
  const block = core.match(/export type CalibrateDeps = \{([\s\S]*?)\n\}/)?.[1] ?? ''
  assert.deepEqual([...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^\s*(\w+)\s*\(/gm)].map((m) => m[1]), ['record'])

  // No code writes calibration_records directly, and none writes client_automations' calibration by hand.
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      const text = readFileSync(p, 'utf8')
      if (/from\(\s*['"]calibration_records['"]\s*\)\s*\.(insert|update|upsert|delete)/.test(text.replace(/\s+/g, ' '))) offenders.push(`${p}: writes calibration_records`)
      if (/calibration:\s*\{[\s\S]{0,200}recorded_at/.test(text) && /\.update\(/.test(text) && /client_automations/.test(text)) offenders.push(`${p}: writes the calibration into config by hand`)
    }
  }
  walk(join(import.meta.dirname, '..', 'src'))
  assert.deepEqual(offenders, [])
})
