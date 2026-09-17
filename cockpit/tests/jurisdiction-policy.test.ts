/*
 * The policy half of the gate — Stage 1, piece 2.
 *
 * Pure, so the whole matrix is testable with no database and nothing written.
 * The property that matters most is the one asserted first and exhaustively:
 * AN UNCONFIRMED ROW PERMITS NOTHING. The eight rows seeded by 0014 carry real
 * research and not one is confirmed, so on the day it is applied the table
 * grants no permission at all -- and that must be true for every segment, not
 * just the ones someone remembered to check.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluatePolicy,
  POLICY_REFUSAL_MEANS,
  type PolicyRefusal,
  type PolicyRow,
  type Segment,
} from '../src/lib/jurisdiction-policy'

const SEGMENTS: Segment[] = ['A', 'B', 'C', 'D', 'E']

const row = (over: Partial<PolicyRow> = {}): PolicyRow => ({
  country: 'PT',
  existing_customer: 'unknown',
  consent_request: 'unknown',
  consent_expiry_months: null,
  platform_blocked: false,
  platform_note: null,
  statute: 'Lei n.º 41/2004',
  authority: 'CNPD',
  traps: null,
  list_obligation: null,
  confirmed_at: null,
  confirmed_by: null,
  ...over,
})
const confirmed = (over: Partial<PolicyRow> = {}) =>
  row({ confirmed_at: '2026-09-20T00:00:00Z', confirmed_by: 'M. de Sousa Pereira', ...over })

test('THE PROPERTY: an unconfirmed row permits nothing, for every segment', () => {
  for (const seg of SEGMENTS) {
    const v = evaluatePolicy(row(), seg, { consentOccurredAt: '2026-09-01T00:00:00Z' })
    assert.equal(v.permitted, false, `segment ${seg} was permitted by an UNCONFIRMED row`)
  }
})

test('a missing row permits nothing either, and says which of the two it is', () => {
  for (const seg of SEGMENTS) {
    for (const absent of [null, undefined]) {
      const v = evaluatePolicy(absent, seg)
      assert.equal(v.permitted, false)
    }
  }
  const v = evaluatePolicy(null, 'B')
  assert.equal(v.permitted === false && v.reason, 'no_policy_row',
    'a missing row and an unconfirmed row are different facts and must not collapse')
  const u = evaluatePolicy(row(), 'B')
  assert.equal(u.permitted === false && u.reason, 'not_confirmed')
})

test('a date with no name is not a confirmation', () => {
  // The database enforces this with a CHECK too; this is the code half, because
  // a row could be handed here from anywhere.
  const halfA = evaluatePolicy(row({ confirmed_at: '2026-09-20T00:00:00Z' }), 'B')
  const halfB = evaluatePolicy(row({ confirmed_by: 'somebody' }), 'B')
  assert.equal(halfA.permitted, false)
  assert.equal(halfB.permitted, false)
})

test('segment B travels: documented consent is permitted wherever the row is confirmed', () => {
  const v = evaluatePolicy(confirmed(), 'B')
  assert.equal(v.permitted, true)
})

test('segment D is refused even in a confirmed, permissive country', () => {
  const v = evaluatePolicy(confirmed({ existing_customer: 'available', consent_request: 'permitted' }), 'D')
  assert.equal(v.permitted === false && v.reason, 'origin_undetermined')
})

test('segment E is refused before anything else is even read', () => {
  // Suppression runs before policy, so this is unreachable in the gate -- which
  // is why it is asserted here. A refusal that depends on a caller remembering
  // is not a refusal.
  const v = evaluatePolicy(confirmed({ existing_customer: 'available' }), 'E')
  assert.equal(v.permitted === false && v.reason, 'objected')
  const noRow = evaluatePolicy(null, 'E')
  assert.equal(noRow.permitted === false && noRow.reason, 'objected', 'E must refuse even with no row at all')
})

test('segment A follows the existing-customer field, and unknown is not permission', () => {
  assert.equal(evaluatePolicy(confirmed({ existing_customer: 'available' }), 'A').permitted, true)
  const un = evaluatePolicy(confirmed({ existing_customer: 'unavailable' }), 'A')
  assert.equal(un.permitted === false && un.reason, 'existing_customer_unavailable')
  const unk = evaluatePolicy(confirmed({ existing_customer: 'unknown' }), 'A')
  assert.equal(unk.permitted === false && unk.reason, 'existing_customer_unknown',
    '"unanalysed" and "analysed and not available" are different facts')
})

test('segment C follows consent_request — the open Gate A question, as data', () => {
  assert.equal(evaluatePolicy(confirmed({ consent_request: 'permitted' }), 'C').permitted, true)
  const p = evaluatePolicy(confirmed({ consent_request: 'prohibited' }), 'C')
  assert.equal(p.permitted === false && p.reason, 'consent_request_prohibited')
  const u = evaluatePolicy(confirmed({ consent_request: 'unknown' }), 'C')
  assert.equal(u.permitted === false && u.reason, 'consent_request_unknown')
})

test('Ireland: consent lapses at twelve months, and an undated consent cannot be aged', () => {
  const IE = confirmed({ country: 'IE', consent_expiry_months: 12 })
  const now = new Date('2026-09-17T00:00:00Z')

  assert.equal(
    evaluatePolicy(IE, 'B', { consentOccurredAt: '2026-06-01T00:00:00Z', now }).permitted,
    true, 'three months old is inside twelve')

  const old = evaluatePolicy(IE, 'B', { consentOccurredAt: '2024-01-01T00:00:00Z', now })
  assert.equal(old.permitted === false && old.reason, 'consent_expired')

  const undated = evaluatePolicy(IE, 'B', { consentOccurredAt: null, now })
  assert.equal(undated.permitted === false && undated.reason, 'consent_undated',
    'this is why consent_events requires occurred_at on consent_given')

  const nonsense = evaluatePolicy(IE, 'B', { consentOccurredAt: 'not a date', now })
  assert.equal(nonsense.permitted === false && nonsense.reason, 'consent_undated')

  // And a country with no expiry does not demand a date it has no use for.
  assert.equal(evaluatePolicy(confirmed(), 'B', { consentOccurredAt: null }).permitted, true)
})

test('the United States is blocked by the platform, before any legal question', () => {
  // platform_blocked is answered ahead of the confirmation check on purpose: it
  // is a fact about delivery, not a legal conclusion, and needs no lawyer.
  const US = row({ country: 'US', platform_blocked: true, platform_note: 'Meta does not deliver marketing templates to +1.' })
  for (const seg of SEGMENTS.filter((s) => s !== 'E')) {
    const v = evaluatePolicy(US, seg)
    assert.equal(v.permitted === false && v.reason, 'platform_blocked', `segment ${seg}`)
  }
  const v = evaluatePolicy(US, 'A')
  assert.ok(v.permitted === false && v.detail.includes('Meta'), 'the platform note reaches the operator')
})

test('every refusal reason has operator wording', () => {
  const reasons: PolicyRefusal[] = [
    'no_policy_row', 'not_confirmed', 'platform_blocked', 'objected', 'origin_undetermined',
    'existing_customer_unavailable', 'existing_customer_unknown',
    'consent_request_prohibited', 'consent_request_unknown', 'consent_expired', 'consent_undated',
  ]
  for (const r of reasons) {
    assert.ok(POLICY_REFUSAL_MEANS[r]?.length > 30, `${r} has no usable explanation`)
  }
})

test('a permission always states its basis, because a log saying "allowed" explains nothing', () => {
  const v = evaluatePolicy(confirmed({ existing_customer: 'available', list_obligation: 'art. 13.º-B lists' }), 'A')
  assert.equal(v.permitted, true)
  if (v.permitted) {
    assert.ok(v.basis.includes('existing-customer'))
    assert.ok(v.basis.includes('Lei'), 'the statute travels with the permission')
    assert.equal(v.listObligation, 'art. 13.º-B lists', 'an obligation attached to the basis must not be lost')
  }
})
