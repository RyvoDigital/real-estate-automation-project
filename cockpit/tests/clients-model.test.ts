/*
 * /CLIENTS, checkpoint 1 (23 Sep 2026): the read path and the model.
 *
 * The decisions this file holds to account:
 *   🔒 most needing attention first, with a stated ranking (operator's choice);
 *   🔒 rehearsals APPEAR, marked — this is who exists, not the business's work;
 *   🔴 a failed read is "unknown" per field, never 0, and never a clean row;
 *   🔴 the gate refusing every contact is its own state, because nothing else
 *      on any screen says so;
 *   🔒 no money, no control that acts, no sample data.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildClientList, attentionFor, type ClientListInputs, type ClientRowInputs } from '../src/lib/clients/model'
import type { Checklist, Step, StepKey, StepState } from '../src/lib/onboarding-checklist'

const NOW = new Date('2026-09-23T10:00:00Z')

const step = (key: StepKey, state: StepState): Step =>
  ({ key, title: key, kind: 'form', state, on: state === 'done' ? '2026-09-01' : null, line: '', href: null })

const checklist = (over: Partial<Record<StepKey, StepState>> = {}, onboarded = false): Checklist => {
  const states: Record<StepKey, StepState> = { agency: 'done', routing: 'done', disclosure: 'done', declaration: 'done', calibration: 'done', ...over }
  const steps = (Object.keys(states) as StepKey[]).map((k) => step(k, states[k]))
  return { steps, onboarded, outstanding: steps.filter((s) => s.state === 'outstanding'), unknown: steps.filter((s) => s.state === 'unknown'), headline: '' }
}

const client = (id: string, name: string, over: Partial<ClientRowInputs> = {}): ClientRowInputs =>
  ({ id, name, rehearsal: false, checklist: checklist({}, true), ...over })

const inputs = (over: Partial<ClientListInputs> = {}): ClientListInputs => ({
  clients: [client('a', 'Marbella Sur')],
  automations: new Map(), waiting: new Map(), faults: new Map(), lastActivity: new Map(), expiries: new Map(),
  faultWindowDays: 7, now: NOW, ...over,
})

test('the row carries each thing on its own, and opens that client', () => {
  const l = buildClientList(inputs({
    clients: [client('a', 'Marbella Sur')],
    automations: new Map([['a', [{ key: 'concierge', name: 'Concierge', enabled: true }, { key: 'react', name: 'Reactivation', enabled: false }]]]),
    waiting: new Map([['a', 2]]),
    faults: new Map([['a', 3]]),
    expiries: new Map([['a', { runOut: 1, aboutTo: 4, toConfirm: 2 }]]),
    lastActivity: new Map([['a', '2026-09-22T18:00:00Z']]),
  }))
  const r = l.rows[0]
  assert.equal(r.href, '/c/a')
  assert.deepEqual([r.automationsOn, r.automationNames], [1, ['Concierge']], 'only what is ON is counted, and it is named')
  assert.deepEqual([r.waiting, r.faults, r.runOut, r.aboutTo, r.toConfirm], [2, 3, 1, 4, 2])
  assert.equal(r.lastActivity, '2026-09-22T18:00:00Z')
  assert.equal(l.faultWindowDays, 7, 'the window travels with the figure, never re-typed on the screen')
})

test('🔒 THE ORDER: waiting, then the gate refusing, then run out, then faults, then soon, then onboarding, then quiet', () => {
  const l = buildClientList(inputs({
    clients: [
      client('quiet', 'Quiet'),
      client('onboarding', 'Onboarding', { checklist: checklist({ routing: 'outstanding' }, false) }),
      client('soon', 'Soon'),
      client('faults', 'Faults'),
      client('runout', 'RunOut'),
      client('refused', 'Refused', { checklist: checklist({ declaration: 'outstanding' }, false) }),
      client('waiting', 'Waiting'),
    ],
    waiting: new Map([['waiting', 1]]),
    faults: new Map([['faults', 2]]),
    expiries: new Map([['runout', { runOut: 1, aboutTo: 0, toConfirm: 0 }], ['soon', { runOut: 0, aboutTo: 1, toConfirm: 0 }]]),
  }))
  assert.deepEqual(l.rows.map((r) => r.id), ['waiting', 'refused', 'runout', 'faults', 'soon', 'onboarding', 'quiet'])
  assert.deepEqual(l.rows.map((r) => r.attention), ['waiting', 'refused', 'runOut', 'faults', 'soon', 'onboarding', 'quiet'])
})

test('🔒 REHEARSALS ARE ALWAYS LAST, whatever state they are in (settled 23 Sep 2026)', () => {
  /*
   * Checkpoint 1 ranked attention first and used real-before-rehearsal as a
   * tie-break, so a rehearsal with five people waiting sat above a real agency
   * with nothing wrong. A rehearsal is not the business's work: it is on this
   * screen because this is who exists, and it never competes for the top.
   */
  const l = buildClientList(inputs({
    clients: [
      client('r', 'A rehearsal', { rehearsal: true }),
      client('real', 'Z real'),
      client('calm', 'B calm and real'),
    ],
    waiting: new Map([['r', 5], ['real', 1]]),
  }))
  assert.deepEqual(l.rows.map((r) => r.id), ['real', 'calm', 'r'])
  assert.equal(l.rows[2].standing, 'rehearsal', 'the rehearsal is last even though it is the one with five waiting')
  assert.deepEqual(l.totals, { clients: 3, rehearsals: 1, notAnswered: 0 })

  // Among rehearsals, the same attention order applies — it is a list, not a heap.
  const many = buildClientList(inputs({
    clients: [
      client('quiet', 'Quiet rehearsal', { rehearsal: true }),
      client('busy', 'Busy rehearsal', { rehearsal: true }),
    ],
    waiting: new Map([['busy', 2]]),
  }))
  assert.deepEqual(many.rows.map((r) => r.id), ['busy', 'quiet'])
})

test('🔴 an unanswered rehearsal question is a THIRD state, never quietly "real"', () => {
  const l = buildClientList(inputs({ clients: [client('a', 'A', { rehearsal: null })] }))
  assert.equal(l.rows[0].standing, 'not_answered')
  assert.equal(l.totals.notAnswered, 1)
})

test('🔴 a failed read is "unknown" per field, never 0 — and it is named', () => {
  const l = buildClientList(inputs({ waiting: null, faults: null, expiries: null, automations: null, lastActivity: null }))
  const r = l.rows[0]
  assert.deepEqual(
    [r.waiting, r.faults, r.runOut, r.aboutTo, r.toConfirm, r.automationsOn, r.lastActivity],
    ['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown'],
  )
  assert.equal(l.failures.length, 5, 'every failed read says so, in its own sentence')
  assert.match(l.failures.join(' '), /waiting on a human could not be read/)
})

test('🔴 a client whose reads failed sorts as ATTENTION, not as calm', () => {
  const l = buildClientList(inputs({
    clients: [client('known', 'Known'), client('unknown', 'Unknown')],
    waiting: null, faults: null, expiries: null,
  }))
  // Neither is certainly quiet, so neither is at the bottom pretending to be.
  assert.deepEqual(l.rows.map((r) => r.attention), ['unknown', 'unknown'])
})

test('🔴 THE GATE REFUSING EVERY CONTACT is its own state, and "we could not look" is not "fine"', () => {
  const refusing = buildClientList(inputs({ clients: [client('a', 'A', { checklist: checklist({ declaration: 'outstanding' }, false) })] }))
  assert.equal(refusing.rows[0].gateRefusingEverything, true)
  assert.equal(refusing.rows[0].attention, 'refused')

  const declared = buildClientList(inputs({ clients: [client('a', 'A')] }))
  assert.equal(declared.rows[0].gateRefusingEverything, false)

  const cannotSay = buildClientList(inputs({ clients: [client('a', 'A', { checklist: checklist({ declaration: 'unknown' }, false) })] }))
  assert.equal(cannotSay.rows[0].gateRefusingEverything, 'unknown')

  const noChecklist = buildClientList(inputs({ clients: [client('a', 'A', { checklist: null })] }))
  assert.equal(noChecklist.rows[0].gateRefusingEverything, 'unknown')
  assert.equal(noChecklist.rows[0].onboarded, 'unknown')
})

test('🔴 the clients themselves failing is NOT an empty list', () => {
  const l = buildClientList(inputs({ clients: null }))
  assert.deepEqual(l.rows, [])
  assert.equal(l.empty, null, 'it must not say "no agency has been taken on yet" when it could not look')
  assert.match(l.failures[0], /could not be read/)
})

test('🔒 THE EMPTY STATE IS THE REAL ONE, and it stays — and it is said ONLY when empty', () => {
  const none = buildClientList(inputs({ clients: [] }))
  assert.match(none.empty ?? '', /No agency has been taken on yet/)
  assert.match(none.empty ?? '', /Onboarding/)
  assert.deepEqual(none.failures, [], 'nothing failed: there are simply none')

  /*
   * 🔴 Found by the sabotage cycle, 23 Sep 2026: nothing asserted that a list
   * WITH agencies has no empty sentence, so `rows.length >= 0` passed the whole
   * suite. A screen that says "no agency has been taken on yet" above a row is
   * the demo-day sentence said over a real client.
   */
  const some = buildClientList(inputs({ clients: [client('a', 'A')] }))
  assert.equal(some.empty, null, 'the empty sentence must not appear above actual rows')
})

test('🔒 no sample data, no money, and no control that acts', () => {
  const model = readFileSync(new URL('../src/lib/clients/model.ts', import.meta.url), 'utf8')
  const read = readFileSync(new URL('../src/lib/clients/read.ts', import.meta.url), 'utf8')
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // Never a fixture: an empty cockpit shown to an agency must be empty.
  assert.doesNotMatch(code(model) + code(read), /Marbella|Casa Atlântica|sample|demo|placeholder/i)
  // The Month owns money.
  assert.doesNotMatch(code(model) + code(read), /revenue|cents|eur|contract_value|payments/i)
  // It lists; it does not act.
  assert.doesNotMatch(code(read), /\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
})

test('🔒 one query per table, never one per client', () => {
  const raw = readFileSync(new URL('../src/lib/clients/read.ts', import.meta.url), 'utf8')
  // 🔒 From the CODE: this file's own comment names readAutomations() as the
  // thing not to do, which is prose, not a call.
  const read = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(read, /readAutomations\(|readOnboardingOne\(|for \(const c of .*\) \{[\s\S]{0,200}await admin\(\)/)
  assert.ok([...read.matchAll(/\.in\('client_id', ids\)/g)].length >= 3, 'the reads are batched by id')
  assert.match(raw, /ONE QUERY PER TABLE, NEVER ONE PER CLIENT/, 'the rule is stated where the next reader will see it')
  // The expiries come from the one module, not from a second definition here.
  assert.match(read, /readExpiries\(now, true\)/)
  assert.doesNotMatch(read, /from\('listing_facts'\)|valid_until/)
})

test('attentionFor is total: every row gets exactly one word, and nothing throws', () => {
  const row = {
    id: 'a', name: 'A', standing: 'real' as const, automationsOn: 0 as const, automationNames: [],
    waiting: 0 as const, faults: 0 as const, runOut: 0 as const, aboutTo: 0 as const, toConfirm: 0 as const,
    gateRefusingEverything: false, onboarded: true, outstanding: [], lastActivity: null,
  }
  assert.equal(attentionFor(row), 'quiet')
  assert.equal(attentionFor({ ...row, onboarded: false }), 'onboarding')
  assert.equal(attentionFor({ ...row, toConfirm: 1 }), 'soon')
  assert.equal(attentionFor({ ...row, onboarded: 'unknown' }), 'unknown')
})
