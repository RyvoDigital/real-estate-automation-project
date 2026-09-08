import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseListingMessage } from '../src/lib/listings/parse'

const AREAS = ['Cascais', 'Estoril', 'Sintra', 'Quinta da Marinha', 'Marbella']

test('a listing as an agent would actually type it', () => {
  const p = parseListingMessage(
    'Novo: Ref A-1042, T4 moradia em Cascais com jardim e piscina, 320m2, 1.950.000€',
    AREAS,
  )
  assert.equal(p.reference, 'A-1042')
  assert.equal(p.property_type, 'house')
  assert.equal(p.bedrooms, 4)
  assert.equal(p.area, 'Cascais')
  assert.equal(p.price, 1_950_000)
  assert.equal(p.size_sqm, 320)
  assert.deepEqual(p.features.sort(), ['garden', 'pool'])
  assert.deepEqual(p.missing, [])
})

test('English, and a longer area name winning over the shorter one inside it', () => {
  const p = parseListingMessage(
    'Ref 7781 · 4 bed villa, Quinta da Marinha, €2.4M, 380 sqm, pool, sea view',
    AREAS,
  )
  assert.equal(p.reference, '7781')
  assert.equal(p.bedrooms, 4)
  assert.equal(p.area, 'Quinta da Marinha', 'not a substring match on a shorter area')
  assert.equal(p.price, 2_400_000)
  assert.equal(p.size_sqm, 380)
  assert.deepEqual(p.features.sort(), ['pool', 'sea view'])
})

/*
 * THE ONE THAT MATTERS MOST IN THIS FILE.
 *
 * "320m2" and "T4" are numbers in the same sentence as the price. A listing
 * with a WRONG price is worse than one with no price: the wrong one gets
 * matched against budgets and put in front of buyers, the missing one is
 * reported as missing.
 */
test('a size or a bedroom count is never read as a price', () => {
  /*
   * m² IS THE CORRECT TYPOGRAPHIC FORM and it is the one that broke.
   *
   * The candidate token is "320m" with the "²" as the NEXT character, so
   * parseMoney read it as 320,000,000 — and in the second case it beat a real
   * price of 1.950.000€ later in the same sentence. An earlier version of this
   * test used "95m2", which never becomes a price candidate at all, so it
   * passed while the guard it claimed to test was never reached.
   */
  const m2 = parseListingMessage('Ref A-1, T4 moradia Cascais 320m²', AREAS)
  assert.equal(m2.price, null, '320m² is an area, not €320,000,000')
  assert.equal(m2.size_sqm, 320)

  const both = parseListingMessage('Ref A-2, T4 Cascais 320 m², 1.950.000€', AREAS)
  assert.equal(both.price, 1_950_000, 'the real price wins, not the size')
  assert.equal(both.size_sqm, 320)

  const p = parseListingMessage('T3 apartamento Estoril 95m2', AREAS)
  assert.equal(p.price, null, 'no price was given, so none is invented')
  assert.equal(p.size_sqm, 95)
  assert.equal(p.bedrooms, 3)
  assert.ok(p.missing.includes('price'), 'and the gap is reported')

  const q = parseListingMessage('T2 Sintra 120m2 450k', AREAS)
  assert.equal(q.price, 450_000)
  assert.equal(q.size_sqm, 120)
})

test('an area the client has not configured is left null, never guessed', () => {
  // §4.3: no hardcoded gazetteer. An area we were not told about is a gap.
  const p = parseListingMessage('Ref B-9, T3 em Alfama, 600k', AREAS)
  assert.equal(p.area, null)
  assert.ok(p.missing.includes('area'))
  const q = parseListingMessage('Ref B-9, T3 em Alfama, 600k', [...AREAS, 'Alfama'])
  assert.equal(q.area, 'Alfama', 'once configured, it is found')
})

/*
 * A short message naming a reference and a status is a STATUS CHANGE. If it
 * were treated as a new listing, the original would go on matching while a
 * duplicate matched nothing — which is the failure this gate exists to stop,
 * arriving through the back door.
 */
test('"A-1042 vendido" is a status change, not a second listing', () => {
  const p = parseListingMessage('A-1042 vendido', AREAS)
  assert.equal(p.statusChange, 'sold')
  assert.equal(p.reference, 'A-1042')
  assert.equal(p.price, null)
})

test('a full listing that merely mentions a word is NOT a status change', () => {
  const p = parseListingMessage('Ref A-9, T3 Cascais 800k, casa disponível desde já', AREAS)
  assert.equal(p.statusChange, null, 'it has a price and bedrooms — it is a listing')
  assert.equal(p.price, 800_000)
})

test('every field the parser could not fill is named', () => {
  const p = parseListingMessage('casa bonita', AREAS)
  for (const f of ['reference', 'bedrooms', 'area', 'price', 'size_sqm', 'features']) {
    assert.ok(p.missing.includes(f), `${f} must be reported missing`)
  }
  assert.equal(p.property_type, 'house', 'what it could read, it read')
})

test('T4 and 320m2 are not mistaken for a reference', () => {
  const p = parseListingMessage('T4 moradia Cascais 320m2 1.950.000€', AREAS)
  assert.equal(p.reference, null)
  assert.ok(p.missing.includes('reference'))
})
