import test from 'node:test'
import assert from 'node:assert/strict'

import { composeAgentNotification, containsPhoneNumber } from '../src/lib/matching/notify'
import { guardDraft, knownFigures } from '../src/lib/draft'
import {
  CHOSEN_BY_AGENT, FIXTURE_LISTING, JOAO, MARIA, fixturePlan,
} from './fixtures/agent-notification'

/**
 * F4's structure, against fixtures — and only its structure.
 *
 * ⚠️ WHAT THESE TESTS DO NOT PROVE. The gate for F4 is "I receive a match
 * notification and it reads like something I'd act on rather than delete", and
 * no fixture can answer that. Every match here was invented by me, including
 * the evidence quotes. What is proved below is that the right blocks appear,
 * that a lead's phone number never does, that a chosen row cannot borrow a
 * computed row's authority, and that a zero says why.
 *
 * Whether an agent would act on it needs an agent. The wording is unvalidated
 * and is marked as such in notify.ts.
 */

test('a match notification names the lead, the reason, and the silence', () => {
  const n = composeAgentNotification({
    listing: FIXTURE_LISTING,
    plan: fixturePlan({ matches: [] }),
    matches: [MARIA],
    chosen: [],
  })

  assert.match(n.text, /A-1042/)
  assert.match(n.text, /Maria Santos/)
  assert.match(n.text, /could stretch for the right place/, 'the decisive quote survives')
  assert.match(n.text, /Not contacted in 5 months/)
  assert.match(
    n.text,
    /filter on their stored fields would not have found this one/,
    'the one claim that distinguishes this from a CRM is stated where the agent reads it',
  )
})

test('⚠️ a lead phone number never reaches the agent’s chat history', () => {
  const n = composeAgentNotification({
    listing: FIXTURE_LISTING,
    plan: fixturePlan(),
    matches: [MARIA, JOAO],
    chosen: [CHOSEN_BY_AGENT],
  })
  assert.equal(
    containsPhoneNumber(n.text), false,
    'the agent acts in the cockpit or by replying, both of which leave a record; a number ' +
      'in a WhatsApp message is forwardable contact data for no operational gain',
  )
  // And the guard is not vacuous: it finds one when one is there.
  assert.equal(containsPhoneNumber(`${n.text}\n+351912345678`), true)
  // …and does not fire on the prices that are legitimately in the text.
  assert.equal(containsPhoneNumber('A-1042 · Cascais · €2,200,000'), false)
})

test('chosen and computed are separate blocks, and chosen carries no score', () => {
  const n = composeAgentNotification({
    listing: FIXTURE_LISTING,
    plan: fixturePlan(),
    matches: [MARIA],
    chosen: [CHOSEN_BY_AGENT],
  })
  const computed = n.blocks.filter((b) => b.kind === 'computed').map((b) => b.text).join(' ')
  const chosen = n.blocks.filter((b) => b.kind === 'chosen').map((b) => b.text).join(' ')

  assert.match(computed, /Maria Santos/)
  assert.match(chosen, /Ana Silva/)
  assert.doesNotMatch(chosen, /Maria Santos/, 'a person’s pick is a different kind of claim')
  assert.match(chosen, /chosen by A\. Ferreira/, 'and it says whose')
  assert.doesNotMatch(
    chosen, /filter on their stored fields/,
    'a chosen row must never borrow the computed claim — nobody computed it',
  )
})

test('a refusal is told to the agent, with what is missing', () => {
  const n = composeAgentNotification({
    listing: FIXTURE_LISTING,
    plan: {
      ran: false,
      refusal: {
        reason: 'thresholds_not_configured',
        missing: ['budget_stretch', 'area_adjacency'],
        detail: 'no thresholds. Missing: budget_stretch, area_adjacency.',
      },
    },
    matches: [],
    chosen: [],
  })
  assert.match(n.text, /could not match this one/)
  assert.match(n.text, /budget_stretch/, 'silence is indistinguishable from "nobody wants it"')
  assert.equal(n.named, 0)
})

test('nothing found says why, and counts the ones with nothing on record', () => {
  const n = composeAgentNotification({
    listing: FIXTURE_LISTING,
    plan: fixturePlan({ considered: 12, unmatchableNoRequirements: ['a', 'b', 'c'] }),
    matches: [],
    chosen: [],
  })
  assert.match(n.text, /No contact matches this one/)
  assert.match(n.text, /12 considered/)
  assert.match(n.text, /3 of them have nothing on record/,
    'an agency whose whole list lands there needs a number, not an empty screen')
})

test('a long run names a few and counts the rest, so it is readable on a phone', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ ...JOAO, leadId: `l${i}`, name: `Lead ${i}` }))
  const n = composeAgentNotification({
    listing: FIXTURE_LISTING,
    plan: fixturePlan(),
    matches: many,
    chosen: [],
  })
  assert.equal(n.named, 5)
  assert.equal(n.omitted, 4)
  assert.match(n.text, /And 4 more/)
  assert.ok(n.text.length < 1600, `a phone-readable message; got ${n.text.length} chars`)
})

// ---------------------------------------------------------------------------
// guardDraft's widened set — one field, and the two traps that prove why
// ---------------------------------------------------------------------------

const LISTING = { price: 1_950_000 }

test('the asking price may be stated', () => {
  assert.deepEqual(guardDraft('A casa está a 1.950.000€.', '', LISTING), { ok: true })
})

test('a figure adjacent to the asking price is refused', () => {
  const r = guardDraft('A casa está a 1.900.000€.', '', LISTING)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.reason, 'invented_a_figure')
})

test('⚠️ the listing’s SIZE does not license a price', () => {
  // Measured: with size_sqm 320 in the known set, "320 mil" — €320,000 —
  // passed. The money pattern matches a bare digit run before `mil`, so a
  // non-money field is indistinguishable from a price once it is in the set.
  const withSize = { price: 1_950_000, size_sqm: 320 } as { price: number | null }
  assert.deepEqual(knownFigures(withSize), ['1950000'], 'one field, not "the listing’s fields"')
  const r = guardDraft('Consigo por 320 mil.', '', withSize)
  assert.equal(r.ok, false, 'a floor area must never become a price the draft may state')
})

test('the known set ignores every listing field but the price', () => {
  // Asserted on knownFigures directly rather than through a draft, because a
  // draft-level assertion here would pass for the WRONG REASON: "4 milhões"
  // is now refused by the money pattern regardless of what is in the set, so
  // the test would stay green even if bedrooms were licensing prices again.
  // The size case above can be tested through a draft; this one cannot.
  const withEverything = { price: 1_950_000, bedrooms: 4, size_sqm: 320, budget_ceiling: 2_300_000 }
  assert.deepEqual(knownFigures(withEverything as { price: number | null }), ['1950000'])
})

test('a derived figure is refused — nothing computed, only what is true of the property', () => {
  // The 15% stretch ceiling on a €2M budget. A real number, computed by us,
  // and not a fact about the listing.
  const r = guardDraft('Podemos chegar a 2.300.000€.', '', { price: 1_950_000 })
  assert.equal(r.ok, false)
})

test('a draft with no listing behaves exactly as before', () => {
  assert.deepEqual(guardDraft('Falo consigo amanhã sobre o valor.', '').ok, false,
    'the time guard is untouched')
  assert.deepEqual(guardDraft('Obrigado pela mensagem.', ''), { ok: true })
})

test('⚠️ a single-digit millions figure is money — it was invisible to the guard', () => {
  // LIVE DEFECT, 18 Sep 2026, in the cockpit's draft assistant (actions.ts):
  // the magnitude branch required three characters before the unit, so
  // "2 milhões" matched nothing and a model could invent it freely. "1.5
  // milhões" was caught, which is the worst shape for a gap — it looks like it
  // works whenever you test it with a realistic-looking number.
  for (const s of ['Consigo por 2 milhões.', 'Consigo por 4 milhões.', 'Fica em 3 milhão.',
                   'Around 2 million.', 'Serían 2 millones.']) {
    const r = guardDraft(s, '')
    assert.equal(r.ok, false, `invented and not caught: ${s}`)
  }
  // The neighbours: a figure the lead really used is still quotable, and the
  // listing's own price is still stateable. A guard that refused everything
  // would pass every case above identically.
  assert.deepEqual(guardDraft('Como disse, 2 milhões.', 'o nosso limite sao 2 milhões').ok, true)
  assert.deepEqual(guardDraft('Está a 1.950.000€.', '', { price: 1_950_000 }).ok, true)
})
