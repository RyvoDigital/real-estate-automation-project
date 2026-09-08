import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetFlexibility, keepOnlyVerifiedEvidence, strengthOf, verifyQuote, type Requirement } from '../src/lib/matching/criteria'
import { missingThresholds, scoreListing, type Listing, type Thresholds } from '../src/lib/matching/score'

const T: Thresholds = {
  budget_stretch: 0.03,
  budget_stretch_with_evidence: 0.15,
  bedrooms_tolerance: 0,
  area_adjacency: { Cascais: ['Estoril', 'Quinta da Marinha'], Estoril: ['Cascais'] },
  min_score_strong: 0.8,
  min_score_possible: 0.5,
}

/* ---------------------------------------------------------------- strength */

test('"couldn’t live without" is a HARD constraint; "it’d be nice" is not', () => {
  const hard = strengthOf('We viewed a few already. We couldn’t live without a garden, the kids need somewhere to play.')
  assert.equal(hard.strength, 'hard')
  assert.match(hard.evidence!, /couldn’t live without a garden/)

  const soft = strengthOf('It’d be nice if it faced south but that is not the main thing.')
  assert.equal(soft.strength, 'preference')
  assert.match(soft.evidence!, /nice if it faced south/)
})

test('Portuguese and Spanish carry the same distinction', () => {
  assert.equal(strengthOf('Não abdicamos do jardim.').strength, 'hard')
  assert.equal(strengthOf('O jardim é essencial para nós.').strength, 'hard')
  assert.equal(strengthOf('Seria bom ter uma varanda.').strength, 'preference')
  assert.equal(strengthOf('El jardín es imprescindible.').strength, 'hard')
  assert.equal(strengthOf('Sería bueno tener terraza.').strength, 'preference')
})

/*
 * An unmarked wish defaults to PREFERENCE. Treating it as hard would silently
 * exclude listings the lead would have wanted to see — a CRM's mistake, made
 * by us, and invisible because the lead never learns what they were not shown.
 */
test('an unmarked wish is a preference, never a hard constraint', () => {
  assert.equal(strengthOf('We are looking for somewhere with a garden.').strength, 'preference')
  assert.equal(strengthOf('Three bedrooms in Cascais.').strength, 'preference')
})

/* ---------------------------------------------------------------- evidence */

test('a quote survives only if the lead really said it', () => {
  const said = ['We could stretch for the right place, but not much more than that.']
  assert.equal(verifyQuote('We could stretch for the right place', said), true)
  assert.equal(verifyQuote('we could STRETCH   for the right place', said), true, 'case and spacing do not matter')
  // The failure this exists for: a model producing a plausible sentence nobody
  // said. It reaches the agent's notification and the agent repeats it to the
  // lead in their own voice — §0, a generated message asserting an untruth.
  assert.equal(verifyQuote('We told you the garden was non-negotiable', said), false)
  assert.equal(verifyQuote('', said), false)
})

test('an unverifiable quote is discarded and the requirement survives without it', () => {
  const reqs: Requirement[] = [
    { kind: 'feature', value: 'garden', strength: 'hard', evidence: 'the garden was the one thing we could not compromise on', source: 'conversation', why: 'stated' },
  ]
  const kept = keepOnlyVerifiedEvidence(reqs, ['We need a garden.'])
  assert.equal(kept[0].evidence, null, 'the invented quote is gone')
  assert.equal(kept[0].strength, 'hard', 'but what we knew is not thrown away')
  assert.match(kept[0].why, /discarded/)
})

/* -------------------------------------------------------------- thresholds */

test('no thresholds means no matching, and it says which are missing', () => {
  assert.deepEqual(missingThresholds({}).sort(), [
    'area_adjacency', 'bedrooms_tolerance', 'budget_stretch',
    'budget_stretch_with_evidence', 'min_score_possible', 'min_score_strong',
  ])
  assert.deepEqual(missingThresholds(T), [], 'a configured client is ready')
  assert.deepEqual(missingThresholds({ ...T, budget_stretch: undefined }), ['budget_stretch'])
})

/* ------------------------------------------- THE ONE THE PRODUCT RESTS ON */

const listing: Listing = {
  id: 'L1', reference: 'A-1042', area: 'Cascais', price: 2_200_000,
  bedrooms: 4, property_type: 'house', features: ['garden', 'pool'], status: 'available',
}

/*
 * §4.2's worked example, and §11 item 5.
 *
 * A €2.2M listing against a stated €2M budget fails a filter. The lead said
 * "we could stretch for the right place", so it matches — and the notification
 * says exactly that.
 *
 * `filterWouldFind` is computed from the STORED FIELDS ONLY, which is what
 * makes item 5 checkable rather than a claim: false here means a CRM working
 * from form fields could not have produced this match.
 */
test('THE MATCH A FIELD-ONLY FILTER WOULD HAVE MISSED', () => {
  const said = [
    'Procuramos uma casa em Cascais, quatro quartos, até 2 milhões.',
    'We could stretch for the right place. And we couldn’t live without a garden — the kids need somewhere to play.',
    'It’d be nice if it faced south.',
  ]
  const flex = budgetFlexibility(said)
  assert.equal(flex.flexible, true)
  assert.match(flex.evidence!, /could stretch for the right place/)

  const requirements: Requirement[] = [
    { kind: 'budget', value: { min: null, max: 2_000_000 }, strength: 'hard', evidence: flex.evidence, source: 'conversation', why: 'stated a ceiling, and stated room in it' },
    { kind: 'area', value: ['Cascais'], strength: 'hard', evidence: null, source: 'field', why: 'stored area' },
    { kind: 'bedrooms', value: 4, strength: 'hard', evidence: null, source: 'field', why: 'stored' },
    { kind: 'feature', value: 'garden', strength: 'hard', evidence: 'we couldn’t live without a garden — the kids need somewhere to play', source: 'conversation', why: 'said they could not live without it' },
    { kind: 'feature', value: 'south facing', strength: 'preference', evidence: 'It’d be nice if it faced south', source: 'conversation', why: 'said it would be nice' },
  ]

  const verified = keepOnlyVerifiedEvidence(requirements, said)
  assert.ok(verified.every((r) => r.evidence === null || verifyQuote(r.evidence, said)), 'every surviving quote is real')

  const r = scoreListing({
    requirements: verified,
    listing,
    thresholds: T,
    budgetFlexible: flex.flexible,
    fields: { budget_max: 2_000_000, area: 'Cascais', bedrooms: 4 },
  })

  assert.equal(r.matched, true, 'it matches — every hard constraint held')
  assert.equal(r.filterWouldFind, false, 'AND A FIELD-ONLY FILTER WOULD NOT HAVE FOUND IT')
  // Meeting every hard constraint is what makes it a match. Missing the one
  // preference they mentioned makes it weak, not absent — the agent is shown
  // it AND shown what it misses, and decides. An earlier version scored this
  // 0.00 and refused it, which is the CRM filter rebuilt by accident.
  assert.equal(r.strength, 'weak')
  assert.equal(r.hardFailed.length, 0)
  assert.ok(r.reasons.some((x) => /could stretch for the right place/.test(x)), 'the reasoning quotes what made it match')
  assert.ok(r.reasons.some((x) => /couldn’t live without a garden/.test(x)), 'and the hard constraint that held')
  assert.equal(r.preferencesMissed.length, 1)
  assert.match(r.preferencesMissed[0].detail, /no south facing/)
})

test('without the stated flexibility, the same listing does NOT match', () => {
  // The control. If it matched either way, the conversation would be
  // decorative and the whole commercial case would be a story.
  const requirements: Requirement[] = [
    { kind: 'budget', value: { min: null, max: 2_000_000 }, strength: 'hard', evidence: null, source: 'field', why: 'stored ceiling' },
  ]
  const r = scoreListing({
    requirements, listing, thresholds: T, budgetFlexible: false,
    fields: { budget_max: 2_000_000, area: 'Cascais', bedrooms: 4 },
  })
  assert.equal(r.matched, false, 'the same listing, same lead, no stated flexibility — no match')
  assert.match(r.reasons.join(' '), /beyond €2,060,000/)
})

test('a failed HARD constraint is not a weak match, it is no match', () => {
  const noGarden: Listing = { ...listing, features: ['pool'], price: 1_800_000 }
  const requirements: Requirement[] = [
    { kind: 'feature', value: 'garden', strength: 'hard', evidence: null, source: 'conversation', why: 'non-negotiable' },
    { kind: 'feature', value: 'pool', strength: 'preference', evidence: null, source: 'conversation', why: 'nice' },
  ]
  const r = scoreListing({ requirements, listing: noGarden, thresholds: T, budgetFlexible: false, fields: { budget_max: 2_000_000, area: 'Cascais', bedrooms: 4 } })
  assert.equal(r.matched, false)
  assert.equal(r.strength, 'none')
  // The pool IS met, so the preference ratio is 1.00 — but the score is 0,
  // because a score of 1.00 on a non-match would sort above real matches in
  // any list ordered by score. The ratio stays visible in preferencesMet.
  assert.equal(r.score, 0)
  assert.equal(r.preferencesMet.length, 1, 'the pool is still recorded as met')
  assert.match(r.reasons.join(' '), /Fails: no garden/)
})

test('geography adjacency comes from config and is explained', () => {
  const estoril: Listing = { ...listing, area: 'Estoril', price: 1_900_000 }
  const requirements: Requirement[] = [{ kind: 'area', value: ['Cascais'], strength: 'hard', evidence: null, source: 'field', why: 'stored' }]
  const r = scoreListing({ requirements, listing: estoril, thresholds: T, budgetFlexible: false, fields: { budget_max: 2_000_000, area: 'Cascais', bedrooms: 4 } })
  assert.equal(r.matched, true)
  assert.equal(r.filterWouldFind, false, 'string equality on area would have missed it')
  assert.match(r.reasons.join(' '), /next to Cascais, which this agency treats as interchangeable/)

  const faro: Listing = { ...listing, area: 'Faro', price: 1_900_000 }
  const r2 = scoreListing({ requirements, listing: faro, thresholds: T, budgetFlexible: false, fields: { budget_max: 2_000_000, area: 'Cascais', bedrooms: 4 } })
  assert.equal(r2.matched, false, 'adjacency is a configured list, not a licence to match anywhere')
})
