import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADVERTISABILITY_LABEL,
  ADVERTISABILITY_TONE,
  NEVER_ASKED,
  advertisabilityFrom,
  advertisabilityWords,
  isAsked,
  statusWords,
} from '../src/lib/listings/advertisability'
import { STATUSES, STATUS_LABEL } from '../src/lib/listings/status'

/*
 * Brief III §5. A listing's advertisability is not its status, and a reader who
 * has once seen the two columns share a word will merge them forever after.
 */

/** Words, lowercased, ignoring accents — because "Vendido" and "vendido" would
 *  read as the same word to somebody scanning a table. */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2)

test('🔴 the two vocabularies share no word', () => {
  /*
   * The check that makes the separation structural rather than careful. It
   * fails the moment somebody improves the copy into a collision — which is
   * exactly when nobody is thinking about §6.
   */
  const status = new Set(statusWords().flatMap(norm))
  const legal = new Set(advertisabilityWords().flatMap(norm))
  const shared = [...status].filter((w) => legal.has(w))

  assert.deepEqual(
    shared,
    [],
    `\n\n  🔴 The status column and the advertisability column share: ${shared.join(', ')}\n\n` +
      '  One says what the agency told us; the other says what the law answers.\n' +
      '  A word in both is what makes a reader merge them — and they move\n' +
      '  independently, which is the whole argument of this screen.\n',
  )
})

test('the control: the disjointness check can see a collision', () => {
  // Without this, "no shared words" and "one of the sets is empty" are the
  // same green.
  assert.ok(statusWords().length >= 5, 'the status vocabulary is empty')
  assert.ok(advertisabilityWords().length >= 4, 'the legal vocabulary is empty')

  const status = new Set(['disponivel'])
  const legal = new Set(['disponivel', 'anunciado'])
  assert.deepEqual([...status].filter((w) => legal.has(w)), ['disponivel'])
})

test('🔴 a sold or withdrawn listing is NOT ASKED, never refused', () => {
  /*
   * Rendering a computed-looking refusal for a property nobody would advertise
   * states a conclusion nobody reached. It was true and beside the point, and
   * it was found in the render rather than in the source.
   */
  for (const status of NEVER_ASKED) {
    assert.equal(isAsked(status), false)
    assert.equal(
      advertisabilityFrom({ status, country: 'PT', verdict: { cleared: false, reason: 'policy_not_confirmed' } }),
      'not_asked',
      `${status} produced a verdict instead of "we did not ask"`,
    )
  }
})

test('🔒 reserved and under-offer ARE asked, or the independence is only asserted', () => {
  /*
   * The case the screen exists to make visible: a property the agency is
   * holding back, which the law permits. If these were never asked, that cell
   * could not exist and the two columns would look coupled.
   */
  for (const status of ['reserved', 'under_offer'] as const) {
    assert.equal(isAsked(status), true)
    assert.equal(advertisabilityFrom({ status, country: 'PT', verdict: { cleared: true } }), 'can')
  }
  // And the mirror: available, refused by the law.
  assert.equal(
    advertisabilityFrom({ status: 'available', country: 'PT', verdict: { cleared: false, reason: 'policy_not_confirmed' } }),
    'cannot',
  )
})

test('🔴 no country recorded is NOT ASKED, never a refusal about the region', () => {
  // Asking the gate with a null would produce "we have not analysed this
  // country", which is false about a country we have analysed.
  assert.equal(advertisabilityFrom({ status: 'available', country: null, verdict: null }), 'not_asked')
})

test('an unresolved jurisdiction is its own answer, not a refusal', () => {
  // "We do not know what the region requires" is the absence of a rule to
  // judge by. "May not be advertised" is a rule that was applied.
  for (const reason of ['no_policy_row', 'region_required', 'region_not_listed']) {
    assert.equal(
      advertisabilityFrom({ status: 'available', country: 'PT', verdict: { cleared: false, reason } }),
      'region_unknown',
      `${reason} rendered as a refusal`,
    )
  }
})

test('🔒 both kinds of not-known are grey, and only a real refusal is red', () => {
  // §0.5: uncertainty and absence are never coloured.
  assert.equal(ADVERTISABILITY_TONE.not_asked, 'grey')
  assert.equal(ADVERTISABILITY_TONE.region_unknown, 'grey')
  assert.equal(ADVERTISABILITY_TONE.cannot, 'red')
  assert.equal(ADVERTISABILITY_TONE.can, 'through')
})

test('every status has a label, and every advertisability word is distinct', () => {
  for (const s of STATUSES) assert.ok(STATUS_LABEL[s], `${s} has no label`)
  const legal = Object.values(ADVERTISABILITY_LABEL)
  assert.equal(new Set(legal).size, legal.length, 'two advertisability states render the same words')
})
