import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bands, type AnomalyTally, type BandInput } from '../src/lib/landing/bands'
import type { AutomationRead } from '../src/lib/landing/automations'
import { automationState } from '../src/lib/automation-state'
import { GATES, gatesHoldingAutomation, type AutomationKey } from '../src/lib/gates'

/*
 * The landing's states, driven without a database — which is why `bands.ts`
 * takes its inputs rather than reading them. Every state below is reachable in
 * a test and exactly one of them is reachable in production today (S2, both
 * clients having never had a lead), so without this file five of the six would
 * ship unrendered and unseen.
 */

const CLIENT = 'c-1'

function automation(key: AutomationKey, over: Partial<AutomationRead> = {}): AutomationRead {
  const held = gatesHoldingAutomation(key)
  return {
    key,
    name: key,
    status: automationState({
      enabled: true,
      everRan: true,
      missing: [],
      heldBy: held.length > 0 ? { what: held[0].gate.what, href: '#nobodys-yet' } : null,
    }),
    lastRun: { at: '2026-09-20T08:00:00Z', status: 'success', errorType: null, errorMessage: null },
    erroredRecently: 0,
    ...over,
  }
}

const quiet: AnomalyTally = { critical: 0, warning: 0, unattributed: 0 }
const base = (over: Partial<BandInput> = {}): BandInput => ({
  clientId: CLIENT,
  automations: [automation('inbound_concierge')],
  anomalies: quiet,
  ...over,
})

test('🔒 the three bands are always present, in order, whatever they hold', () => {
  /*
   * A band that appeared only when it had something would make the page a
   * different shape every morning. The one thing an operator should know
   * without reading is where to look first.
   */
  for (const input of [base(), base({ automations: null }), base({ anomalies: null })]) {
    assert.deepEqual(
      bands(input).map((b) => b.key),
      ['ours', 'theirs', 'nobodys'],
    )
  }
})

test('S1: quiet says so, and it is the welcome kind of empty', () => {
  const [o] = bands(base())
  assert.equal(o.items.length, 0)
  assert.equal(o.empty?.state, 'resting')
  assert.match(o.empty!.sentence, /No errors, firing invariants or configuration gaps/)
})

test('🔴 S1 and S3 never share a sentence — a quiet band and an unasked one', () => {
  /*
   * The distinction the whole empty-state vocabulary exists for. "Nothing is
   * wrong" and "we did not look" are the same pixel count and opposite claims,
   * and the second one arriving dressed as the first is how an operator stops
   * checking.
   */
  const restingSentence = bands(base())[0].empty!.sentence
  const notCheckedSentence = bands(base({ anomalies: null }))[0].empty!.sentence

  assert.notEqual(restingSentence, notCheckedSentence)
  assert.equal(bands(base({ anomalies: null }))[0].empty?.state, 'notChecked')
  assert.match(notCheckedSentence, /we do not know/i)
  // And it names the claim it is NOT, so the two can never be read as one.
  assert.match(notCheckedSentence, /a client with no anomalies/)
})

test('🔴 S4: a failed automations read outranks every empty answer', () => {
  /*
   * The worst available defect on this screen: the read throws, the bands come
   * back empty, and the page says the client is fine. A null read is not a
   * quiet morning.
   */
  const all = bands(base({ automations: null, anomalies: quiet }))
  for (const b of all) {
    assert.equal(b.items.length, 0)
    assert.equal(b.empty?.state, 'readFailed', `${b.key} did not say the read failed`)
    assert.equal(b.empty?.tone, 'red')
    assert.doesNotMatch(b.empty!.sentence, /^No /, `${b.key} is claiming an absence it cannot know about`)
  }
  assert.match(all[0].empty!.sentence, /not saying there is nothing/)
})

test('an errored run lands in ours, red, and carries the stored code in mono', () => {
  const input = base({
    automations: [
      automation('inbound_concierge', {
        erroredRecently: 3,
        lastRun: { at: '2026-09-20T08:00:00Z', status: 'error', errorType: 'twilio_429', errorMessage: 'rate limited' },
      }),
    ],
  })
  const [o] = bands(input)
  assert.equal(o.items.length, 1)
  assert.equal(o.items[0].tone, 'red')
  assert.match(o.items[0].what, /3 errored runs/)
  assert.equal(o.items[0].code, 'twilio_429')
  assert.ok(o.items[0].opens, 'an item in ours-to-fix with nowhere to go is not actionable')
})

test('🔴 a never-configured automation is OURS, and never called "off"', () => {
  /*
   * Off is a decision somebody took; this is an automation nobody set up. The
   * landing putting it in "theirs to answer" would ask the agency to reverse a
   * choice they never made.
   */
  const input = base({
    automations: [
      automation('inbound_concierge', {
        status: automationState({
          enabled: false,
          everRan: false,
          missing: ['this automation has never been set up for this client'],
          heldBy: null,
        }),
      }),
    ],
  })
  const [o, t] = bands(input)
  assert.equal(o.items.length, 1)
  assert.match(o.items[0].what, /not set up/)
  assert.doesNotMatch(o.items[0].what, /\boff\b/)
  assert.equal(t.items.length, 0, 'a configuration gap is not the agency to answer')
})

// ── the split that decides which band a wait falls in ───────────────────────

test('🔴 an outside wait and an agency wait land in different bands', () => {
  /*
   * 02 is held by Meta — nobody here can move it. 03 is held by the calibration
   * afternoon — the agency could book it this week. The brief's own two
   * examples, and if either moves, the screen has stopped matching its design.
   */
  const input = base({ automations: [automation('db_reactivation'), automation('lead_nurture')] })
  const [, theirs, nobodys] = bands(input)

  assert.ok(theirs.items.some((i) => i.code === 'calibration_afternoon'), 'the calibration afternoon is theirs')
  assert.ok(nobodys.items.some((i) => i.code === 'meta_verified'), "Meta's verification is nobody's")
  assert.ok(!theirs.items.some((i) => i.code === 'meta_verified'), 'Meta is not the agency to answer')
  assert.ok(!nobodys.items.some((i) => i.code === 'calibration_afternoon'))
})

test('the tones follow the band: blue where somebody can answer, amber where a clock is the reason', () => {
  const input = base({ automations: [automation('db_reactivation'), automation('lead_nurture')] })
  const [, theirs, nobodys] = bands(input)
  for (const i of theirs.items) assert.equal(i.tone, 'held', `${i.id} should read as a rule holding something back`)
  for (const i of nobodys.items) assert.equal(i.tone, 'clock', `${i.id} should read as a clock`)
})

test('🔒 one gate holding two automations is one item, not two', () => {
  /*
   * Meta holds 02's send path and 05's runner. Printed once per automation, a
   * single wait would look like two problems, and the band whose purpose is to
   * stop weekly re-diagnosis would be inflating the thing it exists to settle.
   */
  const input = base({ automations: [automation('db_reactivation'), automation('reputation_loop')] })
  const [, , n] = bands(input)
  const meta = n.items.filter((i) => i.code === 'meta_verified')
  assert.equal(meta.length, 1, `Meta appears ${meta.length} times`)
  assert.match(meta[0].what, /db_reactivation and reputation_loop/, 'the one item must name both automations it holds')
})

test('every gate item carries the date its wait began, where the gate records one', () => {
  const input = base({ automations: [automation('db_reactivation')] })
  const [, , n] = bands(input)
  const meta = n.items.find((i) => i.code === 'meta_verified')
  assert.ok(meta)
  assert.equal(meta.since, GATES.find((g) => g.id === 'meta_verified')?.since)
  assert.match(meta.since!, /^\d{4}-\d{2}-\d{2}$/, 'the wait track needs a date it can measure from')
})

test('🔴 an OPEN gate leaves the bands entirely', () => {
  /*
   * The ledger's own rule, arriving on a screen. A gate that opened is not
   * holding anything, and a band still showing it is the stale record the
   * ledger was built to prevent — now with a colour and a clock beside it.
   */
  const before = bands(base({ automations: [automation('db_reactivation')] }))[2]
  assert.ok(before.items.some((i) => i.code === 'meta_verified'))

  const meta = GATES.find((g) => g.id === 'meta_verified')!
  meta.open = true
  try {
    const after = bands(base({ automations: [automation('db_reactivation')] }))[2]
    assert.ok(!after.items.some((i) => i.code === 'meta_verified'), 'an opened gate is still shown as a wait')
  } finally {
    meta.open = false
  }
  // And the sabotage was undone, or every later test in this file is lying.
  assert.equal(GATES.find((g) => g.id === 'meta_verified')!.open, false)
})

test('🔴 there is no score, no grade and no overall colour', () => {
  /*
   * The band structure exists so a ninety-minute wait and an unanswered lawyer
   * question do not become one dot. Nothing returned may aggregate across
   * bands — a caller cannot render what it is not given.
   */
  const result = bands(base({ automations: [automation('db_reactivation'), automation('lead_nurture')] }))
  assert.ok(Array.isArray(result))
  const keys = new Set(result.flatMap((b) => Object.keys(b)))
  for (const forbidden of ['score', 'grade', 'health', 'tone', 'severity', 'total']) {
    assert.ok(!keys.has(forbidden), `a band exposes "${forbidden}", which a screen would render as one dot`)
  }
})

test('every item names the screen it opens, or deliberately has nowhere to go', () => {
  const input = base({
    automations: [
      automation('inbound_concierge', { erroredRecently: 1 }),
      automation('db_reactivation'),
      automation('lead_nurture'),
    ],
    anomalies: { critical: 2, warning: 0, unattributed: 0 },
  })
  for (const b of bands(input)) {
    for (const i of b.items) {
      if (i.opens === null) {
        /*
         * 🔴 TIGHTENED 20 Sep, after the landing was found linking band 1 to
         * /settings and /anomalies, neither of which is built.
         *
         * The first version of this test said only the gate bands may have
         * nowhere to go. That was right about intent — an item called "ours to
         * fix" should offer somewhere to fix it — and wrong about the remedy,
         * because the alternative to a missing link is not a link to a 404.
         *
         * So an item in `ours` may have no door, provided its own sentence
         * says WHY and where to go instead. The obligation moves from the link
         * to the words rather than disappearing.
         */
        if (b.key === 'ours') {
          assert.match(
            i.what,
            /not built|\/health|Settings/,
            `${i.id} is ours to fix, offers no door, and does not say where to go instead`,
          )
        }
        continue
      }
      assert.match(i.opens.label, /^opens /, `${i.id}: a door must say where it goes — "${i.opens.label}"`)
      assert.ok(i.opens.href.length > 1)
    }
  }
})
