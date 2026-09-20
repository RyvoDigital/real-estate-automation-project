import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { automationState, type AutomationFacts } from '../src/lib/automation-state'
import { BLOCKED, gatesHoldingAutomation, type AutomationKey } from '../src/lib/gates'

const SRC = join(import.meta.dirname, '..', 'src', 'lib', 'landing', 'automations.ts')
const source = readFileSync(SRC, 'utf-8')

/**
 * Every string passed to `.select(…)` in the module under test.
 *
 * 🔒 COMMENTS ARE STRIPPED, AND THAT IS THE OPPOSITE OF `tokens.test.ts`.
 *
 * The rule earned on 19 September: a phrase in a comment is prose ABOUT the
 * code and can never become behaviour, but a hex in a comment is a colour two
 * keystrokes from a rule. A column name is the first kind. This file's header
 * has to name `health` and `last_run_at` to explain why it does not read them,
 * and a detector that fired on its own explanation would be the third time
 * that mistake was made in a week.
 *
 * Matching the select strings — what ships — rather than the file's text is
 * the detector-precision rule (§1o) applied before the first false positive
 * rather than after it.
 */
function selectArguments(text: string): string[] {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return [...withoutComments.matchAll(/\.select\(\s*'([^']*)'/g)].map((m) => m[1])
}

test('🔴 the two columns 0036 dropped are never named', () => {
  /*
   * 🔴 THE COLUMNS DO NOT EXIST. `0036` dropped them on 19 September, having
   * proved them empty — nothing had ever written to either.
   *
   * Which makes naming them worse than it used to be, not better. Before the
   * drop, selecting them succeeded and rendered "unknown" for a healthy
   * automation and "never" for one that ran this morning. After it, PostgREST
   * fails the WHOLE query, so one dropped name takes the entire clocks strip
   * to S4 and the landing can say nothing at all.
   *
   * The defect is not reading them wrongly. It is naming them at all, which is
   * why this asserts on the column list rather than on what is done next.
   */
  const selects = selectArguments(source)
  assert.ok(selects.length >= 4, `only ${selects.length} selects found — has the reader been rewritten?`)

  for (const s of selects) {
    assert.doesNotMatch(s, /\bhealth\b/, `a select asks for health, which 0036 dropped: ${s}`)
    assert.doesNotMatch(s, /\blast_run_at\b/, `a select asks for last_run_at, which 0036 dropped: ${s}`)
  }

  // And the truth IS read: the last run comes from automation_runs.
  assert.ok(
    selects.some((s) => /started_at/.test(s)),
    'nothing selects started_at, so the last run cannot be known from the runs table',
  )
})

test('the control: the detector can see a forbidden column in a select', () => {
  // Without this, "no select mentions health" and "the regex never matched"
  // are the same green.
  const sabotaged = source.replace(
    ".select('id,automation_id,enabled,config')",
    ".select('id,automation_id,enabled,config,health,last_run_at')",
  )
  assert.notEqual(sabotaged, source, 'the sabotage did not apply — the select string has changed shape')
  const selects = selectArguments(sabotaged)
  assert.ok(selects.some((s) => /\bhealth\b/.test(s)), 'the detector cannot see health in a select')
  assert.ok(selects.some((s) => /\blast_run_at\b/.test(s)), 'the detector cannot see last_run_at in a select')

  // And it does NOT see the header's prose about them, which is the whole
  // reason comments are stripped.
  assert.ok(/health/.test(source), 'the header no longer explains the forbidden columns')
  assert.ok(
    !selectArguments(source).some((s) => /health/.test(s)),
    'stripping comments did not work — the prose is being read as a select',
  )
})

// ── what holds each automation ──────────────────────────────────────────────

test('the strip never says "off" for an automation nobody ever set up', () => {
  /*
   * 🔴 The distinction automation-state.ts exists to protect, arriving at the
   * one place that can destroy it. `enabled: false` is the natural thing to
   * write when there is no row — and it would claim a switch that was never
   * installed. `not set up` is our omission; `off` is a decision somebody took.
   */
  const noRow: AutomationFacts = {
    enabled: false,
    everRan: false,
    missing: ['this automation has never been set up for this client'],
    heldBy: null,
  }
  assert.equal(automationState(noRow).state, 'not_set_up')

  const switchedOff: AutomationFacts = { enabled: false, everRan: false, missing: [], heldBy: null }
  assert.equal(automationState(switchedOff).state, 'off')
})

test('an automation held by a gate says so, and names what holds it', () => {
  const held = gatesHoldingAutomation('db_reactivation')
  assert.ok(held.length > 0, '02 is held by nothing — that would be news')

  const facts: AutomationFacts = {
    enabled: true,
    everRan: true,
    missing: [],
    heldBy: { what: held[0].gate.what, href: '#nobodys-yet' },
  }
  const status = automationState(facts)
  assert.equal(status.state, 'held')
  assert.ok(status.heldBy, 'the held state must never have a null heldBy')
  assert.match(status.heldBy.what, /Meta/, 'what holds 02 today is Meta')
})

test('the live automation is not held by anything', () => {
  /*
   * 01 is the Concierge, which has run in production since 5 September. If a
   * gate ever claims to hold it, either the ledger is wrong or the Concierge
   * has stopped — and both are worth failing over.
   */
  assert.deepEqual(gatesHoldingAutomation('inbound_concierge'), [])
  assert.ok(
    !BLOCKED.some((b) => b.holds === 'inbound_concierge'),
    'something claims to hold the Concierge, which has been running for a fortnight',
  )
})

test('every automation the strip renders is one the ledger can be asked about', () => {
  // The strip's order is a literal list; if a key in it were misspelled, the
  // gate lookup would silently return nothing and the automation would render
  // as free when it is held.
  const ORDER = source.match(/const ORDER: AutomationKey\[\] = \[([\s\S]*?)\]/)
  assert.ok(ORDER, 'the strip no longer declares its order as a literal list')
  const keys = [...ORDER[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) as AutomationKey[]
  assert.equal(keys.length, 5, `the strip renders ${keys.length} automations, not five`)

  const known: AutomationKey[] = [
    'inbound_concierge',
    'db_reactivation',
    'lead_nurture',
    'listing_launch',
    'reputation_loop',
  ]
  for (const k of keys) {
    assert.ok(known.includes(k), `the strip renders ${k}, which is not an automation key`)
    // Asking is legal for all five; only some are held.
    assert.doesNotThrow(() => gatesHoldingAutomation(k))
  }
})
