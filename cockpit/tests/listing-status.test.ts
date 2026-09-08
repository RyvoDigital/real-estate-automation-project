import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MATCHABLE, STATUSES, isMatchable, isStatus, statusFromText } from '../src/lib/listings/status'

test('only `available` is matchable, and it is an allow-list', () => {
  assert.deepEqual([...MATCHABLE], ['available'])
  for (const s of STATUSES) {
    assert.equal(isMatchable(s), s === 'available', `${s} must ${s === 'available' ? '' : 'not '}match`)
  }
})

/*
 * The allow-list property, stated as a test rather than a comment: a status
 * nobody has considered yet must be UNMATCHABLE by default. A deny-list would
 * silently admit it, and the failure would be a buyer hearing about a house
 * that is no longer for sale.
 */
test('a status nobody has thought of yet does not match', () => {
  assert.equal(isMatchable('pending_probate'), false)
  assert.equal(isMatchable('AVAILABLE'), false, 'case is not a status')
  assert.equal(isMatchable(''), false)
  assert.equal(isStatus('availabe'), false, 'the typo the CHECK constraint refuses')
})

test('status changes an agent would actually type, in three languages', () => {
  assert.equal(statusFromText('Sold'), 'sold')
  assert.equal(statusFromText('A-1042 vendido'), 'sold')
  assert.equal(statusFromText('ref A-1042 — under offer'), 'under_offer')
  assert.equal(statusFromText('sob proposta'), 'under_offer')
  assert.equal(statusFromText('reservado'), 'reserved')
  assert.equal(statusFromText('withdrawn'), 'withdrawn')
  assert.equal(statusFromText('retirado do mercado'), 'withdrawn')
  assert.equal(statusFromText('disponível novamente'), 'available')
})

/*
 * "no longer available" contains "available". A looser pattern would read it
 * as putting the listing BACK on the market — the exact inversion of what the
 * agent said, and the one that ends with a buyer being sent a sold house.
 */
test('a negation is never read as the word inside it', () => {
  assert.equal(statusFromText('no longer available'), 'withdrawn')
  assert.equal(statusFromText('já não está disponível'), 'withdrawn')
  assert.equal(statusFromText('ya no está disponible'), 'withdrawn')
})

/*
 * A NEGATED PHRASE IS AMBIGUOUS, NOT THE OPPOSITE.
 *
 * The first version of this parser handled exactly one negation — the
 * "no longer available" idiom — and had a test for it and a comment claiming
 * the parser was conservative. Every other negation was inverted: "not sold"
 * read as sold, "não está reservado" as reserved. One case tested, a property
 * claimed, six counterexamples (lessons §4: a suite complete over the wrong
 * space).
 */
test('a negation is never read as the word it negates', () => {
  for (const phrase of [
    'not sold', 'não vendido', 'nao vendido', 'no vendido',
    'not under offer', 'no longer under offer', 'não está reservado',
    'not withdrawn', 'not available',
  ]) {
    assert.equal(statusFromText(phrase), null, `${phrase} must be asked about, not guessed`)
  }
})

test('an idiom that contains a negator still resolves, because it is an idiom', () => {
  assert.equal(statusFromText('no longer available'), 'withdrawn')
  assert.equal(statusFromText('já não está disponível'), 'withdrawn')
  assert.equal(statusFromText('ya no está disponible'), 'withdrawn')
  assert.equal(statusFromText('off the market'), 'withdrawn')
})

test('an unnegated phrase still resolves', () => {
  assert.equal(statusFromText('still available'), 'available')
  assert.equal(statusFromText('A-1042 ainda disponível'), 'available')
  assert.equal(statusFromText('back on the market'), 'available')
})

test('anything ambiguous returns null so the system asks instead of guessing', () => {
  assert.equal(statusFromText('what is the status of A-1042?'), null)
  assert.equal(statusFromText('maybe sell it next year'), null)
  assert.equal(statusFromText(''), null)
  assert.equal(statusFromText('A-1042'), null)
})
