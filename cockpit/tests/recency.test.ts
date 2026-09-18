import test from 'node:test'
import assert from 'node:assert/strict'

import * as extract from '../src/lib/matching/extract'
import { strengthOf, type Requirement } from '../src/lib/matching/criteria'
import { scoreListing, type Listing, type Thresholds } from '../src/lib/matching/score'

const { extractFromMessages } = extract

/**
 * The two things this change adds are read STRUCTURALLY, not imported.
 *
 * A missing export or a missing field is a COMPILE error, and a suite that
 * cannot compile proves the field is absent rather than that the behaviour is
 * wrong — so the assertions below would never run at all, and "shown red
 * first" would be a claim about tsc instead of about the engine (af4fba6).
 * Read this way, every test runs against today's code and fails on its own
 * assertion, saying what the engine actually did.
 */
type Statement = { text: string; source: 'conversation' | 'note' | 'agent'; at?: string | null }
type Extraction = ReturnType<typeof extractFromMessages>

function extractFromStatements(statements: Statement[], knownAreas: string[]): Extraction {
  const fn = (extract as Record<string, unknown>).extractFromStatements
  assert.equal(typeof fn, 'function', 'extract.ts must export extractFromStatements')
  return (fn as (s: Statement[], a: string[]) => Extraction)(statements, knownAreas)
}

/** `supersededBy` on a requirement, before the field exists on the type. */
function supersededBy(r: Requirement): { evidence: string | null; why: string } | null {
  return ((r as unknown as Record<string, unknown>).supersededBy ?? null) as
    | { evidence: string | null; why: string }
    | null
}

/**
 * The recency rule, and the two causes of the garden case.
 *
 * Every test here failed against the code as it stood on 18 September 2026, and
 * each was written from a MEASUREMENT of what that code did rather than from
 * what it was expected to do. The two that matter most:
 *
 *   "ate 800 mil" then "afinal podemos ir ate 1 milhao"
 *     -> a €950,000 listing REFUSED, with both facts printed side by side
 *
 *   "Procuro T3 em Cascais." then "Tambem estamos a ver em Estoril."
 *     -> NOTHING matched, anywhere. Cascais failed for not being Estoril and
 *        Estoril failed for not being Cascais
 *
 * Both are the invisible direction: too tight. The lead never learns what they
 * were not shown and neither does the agent (§4.1).
 */

const T: Thresholds = {
  budget_stretch: 0.05,
  budget_stretch_with_evidence: 0.15,
  bedrooms_tolerance: 1,
  area_adjacency: {},
  min_score_strong: 0.8,
  min_score_possible: 0.5,
}

const AREAS = ['Cascais', 'Estoril', 'Sintra', 'Faro']

function listing(over: Partial<Listing> = {}): Listing {
  return {
    id: 'l1',
    reference: 'A-1',
    area: 'Cascais',
    price: 700_000,
    bedrooms: 3,
    property_type: null,
    features: [],
    status: 'available',
    ...over,
  }
}

const NO_FIELDS = { budget_max: null, area: null, bedrooms: null }

// ---------------------------------------------------------------------------
// The rule: later supersedes earlier, where we can order
// ---------------------------------------------------------------------------

test('a lead who raises their budget is not refused by their own earlier sentence', () => {
  const e = extractFromMessages(
    ['Procuramos T3 em Cascais ate 800 mil.', 'Afinal podemos ir ate 1 milhao.'],
    AREAS,
  )
  const r = scoreListing({
    requirements: e.requirements,
    listing: listing({ price: 950_000, bedrooms: 3 }),
    thresholds: T,
    budgetFlexible: e.budgetFlexible,
    fields: { budget_max: 1_000_000, area: 'Cascais', bedrooms: 3 },
  })

  assert.equal(r.matched, true, 'the later budget is the lead’s current position')
  assert.equal(
    r.hardFailed.length,
    0,
    `nothing should fail; got: ${r.hardFailed.map((h) => h.detail).join(' // ')}`,
  )
})

test('a lead who lowers their budget is judged against the lower one', () => {
  const e = extractFromMessages(
    ['Procuramos casa em Cascais ate 1 milhao.', 'Afinal so conseguimos ate 800 mil.'],
    AREAS,
  )
  const r = scoreListing({
    requirements: e.requirements,
    listing: listing({ price: 950_000 }),
    thresholds: T,
    budgetFlexible: e.budgetFlexible,
    fields: NO_FIELDS,
  })

  // The rule is RECENCY, not permissiveness. Where we can order, the later
  // statement wins even when it excludes more -- a lead whose circumstances
  // worsened is telling us something, and showing them what they can no longer
  // afford is its own failure.
  assert.equal(r.matched, false, 'the later, lower budget binds')
})

test('a superseded requirement is still reported, with both statements', () => {
  const e = extractFromMessages(
    ['Procuramos T3 em Cascais ate 800 mil.', 'Afinal podemos ir ate 1 milhao.'],
    AREAS,
  )

  const superseded = e.requirements.filter((x) => supersededBy(x))
  assert.equal(superseded.length, 1, 'the earlier budget is marked, not deleted')
  assert.match(String(superseded[0].evidence), /800 mil/)

  const r = scoreListing({
    requirements: e.requirements,
    listing: listing({ price: 950_000 }),
    thresholds: T,
    budgetFlexible: e.budgetFlexible,
    fields: NO_FIELDS,
  })
  const said = r.reasons.join(' // ')
  assert.match(said, /800 mil/, 'the earlier statement is still shown to the agent')
  assert.match(said, /1 milhao|1 milhão/, 'and so is the one it was judged against')
})

// ---------------------------------------------------------------------------
// The rule: where we cannot order, the one that excludes least
// ---------------------------------------------------------------------------

test('an unordered source takes the widest budget and says so in the reasoning', () => {
  // A notes cell is ONE statement written over years by several people. There
  // is no order inside it, so recency cannot decide and the tie goes to the
  // reading that excludes least -- being too loose is visible to the agent,
  // being too tight is invisible to everybody.
  const e = extractFromStatements(
    [{ text: 'Cascais, ate 800 mil. Depois disse que podia ir ate 1 milhao.', source: 'note' }],
    AREAS,
  )
  const r = scoreListing({
    requirements: e.requirements,
    listing: listing({ price: 950_000 }),
    thresholds: T,
    budgetFlexible: e.budgetFlexible,
    fields: NO_FIELDS,
  })

  assert.equal(r.matched, true, 'the widest reading binds when nothing can be ordered')
  assert.match(
    r.reasons.join(' // '),
    /could not be ordered/,
    'and the reasoning says that is what happened',
  )
})

// ---------------------------------------------------------------------------
// Areas accumulate -- they never replace, and they never AND
// ---------------------------------------------------------------------------

test('two areas accumulate and both stay hard', () => {
  const e = extractFromMessages(
    ['Procuro T3 em Cascais.', 'Tambem estamos a ver em Estoril.'],
    AREAS,
  )
  const at = (area: string) =>
    scoreListing({
      requirements: e.requirements,
      listing: listing({ area }),
      thresholds: T,
      budgetFlexible: false,
      fields: NO_FIELDS,
    })

  assert.equal(at('Cascais').matched, true, 'the first town they named')
  assert.equal(at('Estoril').matched, true, 'and the second')

  // The Faro control, re-run. Accumulating areas must not become "any area":
  // §4.1's correction is what stops a lead who named a town matching a listing
  // 500km away, and widening the union must not reopen it.
  const faro = at('Faro')
  assert.equal(faro.matched, false, 'a town they never named is still refused')
  assert.equal(faro.hardFailed.length, 1, 'refused by the area constraint itself')
})

test('two areas named in one sentence are both extracted', () => {
  // knownAreas.find() returned the FIRST match only, so the second town was
  // dropped silently -- the same too-tight failure arriving one layer earlier
  // than the one above, and invisible in exactly the same way.
  const e = extractFromMessages(['Procuro T3 em Cascais ou Estoril.'], AREAS)
  const areas = e.requirements.filter((r) => r.kind === 'area').flatMap((r) => r.value as string[])
  assert.deepEqual([...areas].sort(), ['Cascais', 'Estoril'])
})

// ---------------------------------------------------------------------------
// The garden case -- two causes, and each needs its own test
// ---------------------------------------------------------------------------

test('"precisamos mesmo de um jardim, é essencial" is ONE hard constraint, not two weak preferences', () => {
  const e = extractFromMessages(
    ['Na verdade nao, precisamos mesmo de um jardim. É essencial.'],
    AREAS,
  )
  const gardens = e.requirements.filter((r) => r.kind === 'feature' && r.value === 'garden')
  assert.equal(gardens.length, 1, 'one requirement, not one per sentence')
  assert.equal(gardens[0].strength, 'hard', 'a lead upgrading a wish is not saying it twice, weakly')
})

test('a marker-only sentence attaches backwards; a sentence with its own criterion does not', () => {
  // Cause 1, on its own: the criterion sentence carries NO hard marker, so the
  // only route to `hard` is the following sentence attaching to it.
  const up = extractFromMessages(['Um jardim seria bom. É essencial.'], AREAS)
  const garden = up.requirements.find((r) => r.value === 'garden')
  assert.equal(garden?.strength, 'hard', 'the marker-only sentence upgrades the one before it')

  // And the bound: a sentence that carries its own criterion does not absorb
  // the previous sentence's marker. Widening the window past adjacency is how
  // the garage's "precisamos" reaches the garden.
  const bounded = extractFromMessages(['Precisamos de garagem. Um jardim seria bom.'], AREAS)
  const parking = bounded.requirements.find((r) => r.value === 'parking')
  const nice = bounded.requirements.find((r) => r.value === 'garden')
  assert.equal(parking?.strength, 'hard', 'the garage keeps its own marker')
  assert.equal(nice?.strength, 'preference', 'and does not lend it to the garden')
})

test('"necesitamos un jardín" is hard, like its English and Portuguese equivalents', () => {
  // Cause 2, and the reason for checking rather than assuming: the gap was in
  // TWO of the three languages. English had `we need` all along.
  assert.equal(strengthOf('We need a garden.').strength, 'hard', 'en')
  assert.equal(strengthOf('Precisamos mesmo de um jardim.').strength, 'hard', 'pt')
  assert.equal(strengthOf('Necesitamos un jardín.').strength, 'hard', 'es')
  assert.equal(strengthOf('Necesito un jardín.').strength, 'hard', 'es, singular')
  assert.equal(strengthOf('Temos de ter jardim.').strength, 'hard', 'pt, the existing form')
})

test('"não precisamos de jardim" is still not a requirement', () => {
  // Every new marker re-checked against the negation guard in the same pass.
  // A marker list grown without this is lesson 1e exactly: the guard existed,
  // was written the same day, and was not applied to the second caller.
  for (const s of [
    'Não precisamos de jardim.',
    'Nao precisamos mesmo de um jardim.',
    'No necesitamos un jardín.',
    'We do not need a garden.',
  ]) {
    assert.notEqual(strengthOf(s).strength, 'hard', `negated: ${s}`)
  }
})

test('the same wish stated twice is one requirement, and the stronger statement wins', () => {
  // Not a conflict -- a duplicate. Two requirements for one wish distort the
  // preference ratio, which is what `strength` is computed from, so a lead who
  // mentioned the garden twice would be scored differently from one who
  // mentioned it once and meant the same thing.
  const e = extractFromMessages(['Um jardim seria bom.', 'Precisamos mesmo de um jardim.'], AREAS)
  const gardens = e.requirements.filter((r) => r.value === 'garden' && !supersededBy(r))
  assert.equal(gardens.length, 1)
  assert.equal(gardens[0].strength, 'hard', 'the stronger statement decides')
})

test('"na verdade não, precisamos de um jardim" is a requirement — the negator is the previous clause', () => {
  // The `não` refutes what the lead said BEFORE; the clause after the comma is
  // the requirement. Read across the comma, the clearest possible upgrade of a
  // wish into a requirement inverts into no requirement at all.
  //
  // This case exists because the garden test could NOT fail on it: there, the
  // following sentence upgrades the requirement anyway, so the clause boundary
  // was a guard with nothing testing it (§0.7). One sentence, no rescue.
  assert.equal(strengthOf('Na verdade não, precisamos de um jardim.').strength, 'hard')
  assert.equal(strengthOf('En realidad no, necesitamos un jardín.').strength, 'hard')

  // The control, so the boundary cannot be widened into "negation never
  // applies": inside one clause, a negator still negates.
  assert.equal(strengthOf('Não precisamos de um jardim.').strength, 'preference')
})
