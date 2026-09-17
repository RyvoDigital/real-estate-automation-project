/*
 * The reserved range, and the refusal that replaces a convention.
 *
 * "+351900000xxx is treated as synthetic everywhere" is a rule that lives in
 * people's heads. This file is the part that does not: the range is refused
 * outright, as its own check, so that the day a real number falls inside it or
 * a test range leaks into an import, the machinery does not do exactly what it
 * was told.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isReservedTestNumber,
  RESERVED_FIXTURES,
  RESERVED_TEST_REASON,
} from '../src/lib/reserved-numbers'
import { resolveJurisdiction } from '../src/lib/jurisdiction'

test('the whole reserved block is recognised, and its edges', () => {
  assert.equal(isReservedTestNumber('+351900000000'), true, 'first in the block')
  assert.equal(isReservedTestNumber('+351900000999'), true, 'last in the block')
  assert.equal(isReservedTestNumber('+351900000001'), true)
  assert.equal(isReservedTestNumber(' +351900000001 '), true, 'whitespace does not smuggle one through')
  for (const f of Object.values(RESERVED_FIXTURES)) {
    assert.equal(isReservedTestNumber(f), true, `${f} is a fixture and must be recognised`)
  }
})

test('real numbers are not in it, including the near misses', () => {
  assert.equal(isReservedTestNumber('+351912345678'), false, 'the real quarantined contact')
  assert.equal(isReservedTestNumber('+351900001001'), false, 'one digit out of the block')
  assert.equal(isReservedTestNumber('+35190000001'), false, 'too short')
  assert.equal(isReservedTestNumber('+3519000000011'), false, 'too long')
  assert.equal(isReservedTestNumber('+34900000001'), false, 'Spanish 900, not ours')
  assert.equal(isReservedTestNumber(''), false)
  assert.equal(isReservedTestNumber(null), false)
  assert.equal(isReservedTestNumber(undefined), false)
})

test('the resolver does NOT reject these, which is why the refusal has to exist', () => {
  // An earlier comment in reserved-numbers.ts claimed 900-series numbers fail
  // to parse. They do not: libphonenumber calls them valid and Portuguese. So
  // nothing may rely on resolution to keep them out of a send.
  const r = resolveJurisdiction(RESERVED_FIXTURES.objected)
  assert.equal(r.ok, true, 'if this ever starts failing, the note in reserved-numbers.ts is stale')
  if (r.ok) assert.equal(r.country, 'PT')
})

test('the refusal carries a reason a human can read', () => {
  assert.ok(RESERVED_TEST_REASON.includes('+351900000xxx'))
  assert.ok(RESERVED_TEST_REASON.length > 30, 'a bare code on an operator screen explains nothing')
})

test('RECORDING is allowed and only SENDING is refused — the tests depend on it', () => {
  // The fixtures exist so that objections, claims and consents CAN be written
  // for them. If a future edit makes the reserved check refuse writes too, the
  // ledger's write path becomes untestable and this test says so out loud.
  assert.equal(Object.keys(RESERVED_FIXTURES).length >= 3, true)
  assert.notEqual(
    RESERVED_TEST_REASON.toLowerCase().includes('never recorded'), true,
    'the reason must not claim these are never recorded — they are, deliberately',
  )
})
