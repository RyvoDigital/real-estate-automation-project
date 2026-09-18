import test from 'node:test'
import assert from 'node:assert/strict'

import { TransportFailure, NOT_A_RULE_FAILURE, classifyRpcError } from './lib/rpc-errors'

/**
 * The defect: on 18 Sep 2026 a transient network failure reported as
 * `RULE 1: an objection is permanent` — the most important rule in the
 * codebase appearing to break. Every defect becomes a permanent test.
 */

test('🔴 a failure with no code is transport, and SAYS the rule was not evaluated', () => {
  const e = classifyRpcError('resolve_consent_state', { message: 'fetch failed' })
  assert.ok(e instanceof TransportFailure)
  assert.match(e.message, /NOT A RULE FAILURE/)
  assert.match(e.message, /NEVER EVALUATED/)
  assert.ok(e.message.startsWith('⚠️'), 'it is the FIRST thing a reader sees, not a footnote')
})

test('a failure WITH a code is about the function, and says where to look', () => {
  const e = classifyRpcError('resolve_consent_state', { code: '42883', message: 'no such function' })
  assert.equal(e instanceof TransportFailure, false)
  assert.match(e.message, /42883/)
  assert.match(e.message, /the migration that creates it has not been applied/)
  assert.doesNotMatch(e.message, /NOT A RULE FAILURE/, 'this one might well be')
})

test('an empty-string code is treated as no code', () => {
  // PostgREST has returned '' rather than null. A falsy code is not an answer.
  assert.ok(classifyRpcError('f', { code: '', message: 'x' }) instanceof TransportFailure)
  assert.ok(classifyRpcError('f', { code: null, message: 'x' }) instanceof TransportFailure)
})

test('the banner names transport before it names anything else', () => {
  // The whole fix is the ORDER of the words: a reader scanning a failed run
  // sees "not a rule failure" before they see the stack.
  const lines = (NOT_A_RULE_FAILURE + 'TypeError: fetch failed').split('\n')
  assert.match(lines[0], /NOT A RULE FAILURE/)
  assert.match(lines[lines.length - 1], /Transport error: /)
})

test('🔴 nothing here suppresses a failure', () => {
  // A classifier that could swallow an error would be worse than the defect it
  // fixes: the suite would go green on an unreachable database, and every rule
  // in it would be unproven and look proven.
  for (const input of [{ message: 'x' }, { code: '23514', message: 'y' }]) {
    assert.ok(classifyRpcError('f', input) instanceof Error, 'it always returns something to throw')
  }
})
