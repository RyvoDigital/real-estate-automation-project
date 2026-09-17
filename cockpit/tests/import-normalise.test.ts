import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanName,
  normaliseEmail,
  parseBedrooms,
  parseBudgetRange,
  readConsentClaim,
  parseDate,
  parseMoney,
  toE164,
} from '../src/lib/import/normalise'

/*
 * Every case here is a shape a real agency spreadsheet actually contains.
 * The ones that matter most are the ones where being wrong is silent: a money
 * value misread by a factor of a thousand still looks like a budget, and a
 * phone number that parses to the wrong country still looks like a phone
 * number.
 */

test('phones: the shapes a spreadsheet actually holds', () => {
  assert.equal(toE164('+351912345678'), '+351912345678')
  assert.equal(toE164('912345678'), '+351912345678')          // bare, PT default
  assert.equal(toE164('00351 912 345 678'), '+351912345678')  // 00 prefix
  assert.equal(toE164('+351-912-345-678'), '+351912345678')
  assert.equal(toE164('351912345678', 'PT'), '+351912345678')
  assert.equal(toE164('+34 600 123 456'), '+34600123456')     // Spain
  assert.equal(toE164('600123456', 'ES'), '+34600123456')
})

test('phones: Excel damage is refused, not guessed at', () => {
  // Excel turns a long number into scientific notation and DESTROYS digits.
  // "9.12346E+11" is not a recoverable phone number, and inventing the missing
  // ones would produce a number that belongs to somebody else.
  assert.equal(toE164('9.12346E+11'), null)
  assert.equal(toE164('912345678.0'), '+351912345678')        // trailing .0 is safe
  assert.equal(toE164(''), null)
  assert.equal(toE164('n/a'), null)
  assert.equal(toE164('12'), null)
})

test('money: dots and commas mean different things in different rows', () => {
  assert.equal(parseMoney('1.500.000'), 1_500_000)   // Iberian thousands
  assert.equal(parseMoney('1,500,000'), 1_500_000)   // anglophone thousands
  assert.equal(parseMoney('1,5M'), 1_500_000)        // comma decimal + multiplier
  assert.equal(parseMoney('1.5M'), 1_500_000)        // dot decimal + multiplier
  assert.equal(parseMoney('€1.5m'), 1_500_000)
  assert.equal(parseMoney('850k'), 850_000)
  assert.equal(parseMoney('850 mil'), 850_000)
  assert.equal(parseMoney('2000000'), 2_000_000)
  assert.equal(parseMoney('1.234.567,89'), 1_234_568) // both separators, comma last
  assert.equal(parseMoney('1,234,567.89'), 1_234_568) // both separators, dot last
})

test('money: a value we cannot scale is refused rather than stored wrong', () => {
  // This is the case that matters. "1.5" in a budget column almost certainly
  // means 1.5 million, but it could mean anything, and storing 1.5 as a budget
  // is wrong by six orders of magnitude while looking perfectly valid.
  assert.equal(parseMoney('1.5'), null)
  assert.equal(parseMoney('0'), null)
  assert.equal(parseMoney(''), null)
  assert.equal(parseMoney('ask'), null)
  assert.equal(parseMoney('n/a'), null)
})

test('budget ranges, including the ones written backwards', () => {
  assert.deepEqual(parseBudgetRange('1.5M - 2M'), { min: 1_500_000, max: 2_000_000 })
  assert.deepEqual(parseBudgetRange('€800k – €1.2M'), { min: 800_000, max: 1_200_000 })
  assert.deepEqual(parseBudgetRange('1.000.000 a 1.500.000'), { min: 1_000_000, max: 1_500_000 })
  assert.deepEqual(parseBudgetRange('2M - 1.5M'), { min: 1_500_000, max: 2_000_000 }) // reversed
  assert.deepEqual(parseBudgetRange('up to 2M'), { min: null, max: 2_000_000 })
  assert.deepEqual(parseBudgetRange('até 900k'), { min: null, max: 900_000 })
  assert.deepEqual(parseBudgetRange('800k+'), { min: 800_000, max: null })
  assert.deepEqual(parseBudgetRange('1.5M'), { min: 1_500_000, max: 1_500_000 })
  assert.deepEqual(parseBudgetRange(''), { min: null, max: null })
})

test('bedrooms: T3 is not a typo, it is how this market writes it', () => {
  assert.equal(parseBedrooms('T3'), 3)
  assert.equal(parseBedrooms('t2'), 2)
  assert.equal(parseBedrooms('T 4'), 4)
  assert.equal(parseBedrooms('V4'), 4)          // moradia / detached typology
  assert.equal(parseBedrooms('3 bed'), 3)
  assert.equal(parseBedrooms('3 quartos'), 3)
  assert.equal(parseBedrooms('3 dorm.'), 3)
  assert.equal(parseBedrooms('4+'), 4)
  assert.equal(parseBedrooms('0'), 0)           // T0 is a studio, a real answer
  assert.equal(parseBedrooms(''), null)
  assert.equal(parseBedrooms('any'), null)
})

test('consent: a cell is read as a CLAIM, and never as consent', () => {
  // The reading survives. What changed is that it can no longer be mistaken
  // for a state: every answer carries the cell it came from.
  assert.deepEqual(readConsentClaim('yes'), { raw: 'yes', parsed: 'opt_in' })
  assert.deepEqual(readConsentClaim('1'), { raw: '1', parsed: 'opt_in' })
  assert.deepEqual(readConsentClaim('no'), { raw: 'no', parsed: 'opt_out' })
  assert.deepEqual(readConsentClaim('unsubscribed'), { raw: 'unsubscribed', parsed: 'opt_out' })
  assert.deepEqual(readConsentClaim('maybe'), { raw: 'maybe', parsed: 'unknown' })
  assert.deepEqual(readConsentClaim('called them once'), { raw: 'called them once', parsed: 'unknown' })
  assert.deepEqual(readConsentClaim('opt in?'), { raw: 'opt in?', parsed: 'unknown' })
})

test('consent: the cell is kept exactly as typed, because the wording is the evidence', () => {
  // Meta puts the burden of proof on the sender and asks for the wording. A
  // lowercased or stripped copy is a worse record than the original, and the
  // original costs nothing to keep.
  assert.deepEqual(readConsentClaim('Sim'), { raw: 'Sim', parsed: 'opt_in' })
  assert.deepEqual(readConsentClaim('TRUE'), { raw: 'TRUE', parsed: 'opt_in' })
  assert.deepEqual(readConsentClaim('não'), { raw: 'não', parsed: 'opt_out' })
  assert.deepEqual(readConsentClaim('  sí  '), { raw: 'sí', parsed: 'opt_in' }, 'trimmed, not altered')
})

test('consent: an empty cell is no claim at all, not an unknown one', () => {
  // The distinction is load-bearing. "The agency said something we could not
  // read" and "the agency said nothing" are different facts about the world,
  // and §5b is the whole file's warning about collapsing them.
  assert.equal(readConsentClaim(''), null)
  assert.equal(readConsentClaim('   '), null)
})

test('dates: day-first, and ambiguity resolved one way on purpose', () => {
  assert.equal(parseDate('2026-04-15'), '2026-04-15')
  assert.equal(parseDate('15/04/2026'), '2026-04-15')
  assert.equal(parseDate('15-04-2026'), '2026-04-15')
  assert.equal(parseDate('15.04.2026'), '2026-04-15')
  assert.equal(parseDate('05/04/2026'), '2026-04-05')   // day-first: 5 April
  assert.equal(parseDate('15/04/26'), '2026-04-15')
  assert.equal(parseDate('32/01/2026'), null)
  assert.equal(parseDate('31/02/2026'), null)           // not a real date
  assert.equal(parseDate(''), null)
  assert.equal(parseDate('last year'), null)
})

test('names and emails: a placeholder is not a value', () => {
  assert.equal(cleanName('  Maria   Santos '), 'Maria Santos')
  assert.equal(cleanName('n/a'), null)
  assert.equal(cleanName('-'), null)
  assert.equal(cleanName(''), null)
  assert.equal(normaliseEmail(' Maria@Example.COM '), 'maria@example.com')
  assert.equal(normaliseEmail('not an email'), null)
  assert.equal(normaliseEmail('a@b'), null)
  assert.equal(normaliseEmail(''), null)
})
