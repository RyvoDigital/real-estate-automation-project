/*
 * The send gate — Stage 1, piece 4.
 *
 * decideGate is pure, so every branch is reachable here with no database and
 * nothing written. The tests are arranged by the property each defends rather
 * than by input, because the ordering of the five layers IS the design:
 *
 *   reserved -> resolution -> suppression -> basis -> policy
 *
 * The most important tests are the ones where a LATER layer would have
 * permitted and an EARLIER one refuses. A gate whose layers are individually
 * right but wrongly ordered passes every test written one layer at a time.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideGate, GATE_REFUSAL_MEANS, type ConsentFacts } from '../src/lib/gate'
import type { PolicyRow, Segment } from '../src/lib/jurisdiction-policy'
import { RESERVED_FIXTURES } from '../src/lib/reserved-numbers'

const PT_OPEN: PolicyRow = {
  country: 'PT',
  existing_customer: 'available',
  consent_request: 'permitted',
  consent_expiry_months: null,
  platform_blocked: false,
  platform_note: null,
  statute: 'Lei n.º 41/2004',
  authority: 'CNPD',
  traps: null,
  obligation_codes: ['pt_13b_lists'],
  confirmed_at: '2026-09-20T00:00:00Z',
  confirmed_by: 'M. de Sousa Pereira',
}
const consented: ConsentFacts = {
  state: 'consented', segment: null,
  occurred_at: '2026-08-01T00:00:00Z', event_id: 'e1e1e1e1-0000-0000-0000-000000000001',
}
const REAL = '+351912345678'

test('the happy path exists, so the refusals below mean something', () => {
  const v = decideGate({ phone: REAL, consent: consented, policy: PT_OPEN })
  assert.equal(v.permitted, true)
})

test('LAYER 1 beats everything: a reserved number is refused where all else permits', () => {
  // The whole point of the reserved range. Everything downstream says yes.
  const v = decideGate({ phone: RESERVED_FIXTURES.consented, consent: consented, policy: PT_OPEN })
  assert.equal(v.permitted, false)
  if (!v.permitted) {
    assert.equal(v.layer, 'reserved')
    assert.equal(v.reason, 'reserved_test_number')
  }
})

test('LAYER 1 beats a confirmed consent AND an open policy for every fixture', () => {
  for (const [name, phone] of Object.entries(RESERVED_FIXTURES)) {
    const v = decideGate({ phone, consent: consented, policy: PT_OPEN })
    assert.equal(v.permitted, false, `${name} (${phone}) was PERMITTED — the fixtures are messageable`)
  }
})

test('LAYER 2: an unresolvable number is refused before the ledger is consulted', () => {
  const v = decideGate({ phone: '9.12346E+11', consent: consented, policy: PT_OPEN })
  assert.equal(v.permitted, false)
  if (!v.permitted) {
    assert.equal(v.layer, 'resolution')
    assert.equal(v.reason, 'unparseable')
  }
})

test('LAYER 3 beats a later consent: an objection is refused where policy permits', () => {
  // Rule 1 again, at the gate. consent_by_contact already resolves objected,
  // and the gate refuses on it rather than re-deriving -- one definition.
  const objected: ConsentFacts = { state: 'objected', segment: null, occurred_at: null, event_id: 'x' }
  const v = decideGate({ phone: REAL, consent: objected, policy: PT_OPEN })
  assert.equal(v.permitted, false)
  if (!v.permitted) {
    assert.equal(v.layer, 'suppression')
    assert.equal(v.reason, 'objected')
    assert.match(v.detail, /never overturned/)
  }
})

test('LAYER 4: no ledger basis, and the two kinds of nothing are told apart', () => {
  const nothing = decideGate({ phone: REAL, consent: null, policy: PT_OPEN })
  const claimed = decideGate({
    phone: REAL,
    consent: { state: 'claimed_unevidenced', segment: null, occurred_at: null, event_id: 'c1' },
    policy: PT_OPEN,
  })
  for (const v of [nothing, claimed]) {
    assert.equal(v.permitted, false)
    if (!v.permitted) assert.equal(v.layer, 'basis')
  }
  // Same refusal, different detail: one is worth asking the agency about.
  if (!nothing.permitted && !claimed.permitted) {
    assert.match(claimed.detail, /unevidenced claim/)
    assert.match(nothing.detail, /never been recorded|Nothing has ever been recorded/)
    assert.notEqual(nothing.detail, claimed.detail)
  }
})

test('LAYER 5: an unconfirmed policy row refuses a perfectly good consent', () => {
  const v = decideGate({ phone: REAL, consent: consented, policy: { ...PT_OPEN, confirmed_at: null, confirmed_by: null } })
  assert.equal(v.permitted, false)
  if (!v.permitted) {
    assert.equal(v.layer, 'policy')
    assert.equal(v.reason, 'not_confirmed')
  }
})

test('LAYER 5: no policy row at all refuses, which is how a new country fails safe', () => {
  const v = decideGate({ phone: REAL, consent: consented, policy: null })
  assert.equal(v.permitted, false)
  if (!v.permitted) assert.equal(v.reason, 'no_policy_row')
})

test('a declared segment travels from the ledger into the policy question', () => {
  const declared = (segment: Segment): ConsentFacts =>
    ({ state: 'declared', segment, occurred_at: '2026-01-01T00:00:00Z', event_id: 'd1' })

  assert.equal(decideGate({ phone: REAL, consent: declared('A'), policy: PT_OPEN }).permitted, true)
  assert.equal(decideGate({ phone: REAL, consent: declared('C'), policy: PT_OPEN }).permitted, true)

  // Spain: the existing-customer route unavailable and segment C prohibited.
  const ES: PolicyRow = { ...PT_OPEN, country: 'ES', existing_customer: 'unavailable', consent_request: 'prohibited', obligation_codes: null }
  const a = decideGate({ phone: '+34600123456', consent: declared('A'), policy: ES })
  const c = decideGate({ phone: '+34600123456', consent: declared('C'), policy: ES })
  assert.equal(a.permitted === false && a.reason, 'existing_customer_unavailable')
  assert.equal(c.permitted === false && c.reason, 'consent_request_prohibited')
  // …and documented consent still travels there.
  assert.equal(decideGate({ phone: '+34600123456', consent: consented, policy: ES }).permitted, true)
})

test('segment D declared by the agency is refused by policy, not silently upgraded', () => {
  const v = decideGate({
    phone: REAL,
    consent: { state: 'declared', segment: 'D', occurred_at: null, event_id: 'd' },
    policy: PT_OPEN,
  })
  assert.equal(v.permitted, false)
  if (!v.permitted) assert.equal(v.layer, 'basis')
})

test('Guernsey: +44 resolves to GG, which has no row, so it refuses', () => {
  // The finding that a prefix table would have hidden. GB's row does not cover
  // the Crown Dependencies, and deny-by-default turns that into a refusal only
  // because the resolver is honest about what it found.
  const GB: PolicyRow = { ...PT_OPEN, country: 'GB' }
  const v = decideGate({ phone: '+447911123456', consent: consented, policy: null })
  assert.equal(v.permitted, false)
  if (!v.permitted) assert.equal(v.reason, 'no_policy_row')
  // And a GB number with the GB row does pass, so the refusal above is about
  // the country and not about +44.
  assert.equal(decideGate({ phone: '+447400123456', consent: consented, policy: GB }).permitted, true)
})

test('THE PERMISSION STATES ITS BASIS AND CARRIES ITS OBLIGATIONS (§11)', () => {
  const v = decideGate({ phone: REAL, consent: consented, policy: PT_OPEN })
  assert.equal(v.permitted, true)
  if (v.permitted) {
    assert.match(v.basis, /documented consent/)
    assert.match(v.basis, /PT/)
    assert.deepEqual(v.obligations, ['pt_13b_lists'],
      'an obligation attached to the basis must travel inside the verdict, never separately')
    assert.equal(v.evidence.country, 'PT')
    assert.equal(v.evidence.segment, 'B')
    assert.equal(v.evidence.consentEventId, 'e1e1e1e1-0000-0000-0000-000000000001')
    assert.equal(v.evidence.policyConfirmedBy, 'M. de Sousa Pereira')
    assert.ok(v.evidence.policyConfirmedAt, 'the send record must be able to name the confirmation it relied on')
  }
})

test('no refusal the gate can produce lacks operator wording', () => {
  const cases: Array<{ phone: string; consent: ConsentFacts; policy: PolicyRow | null }> = [
    { phone: RESERVED_FIXTURES.objected, consent: consented, policy: PT_OPEN },
    { phone: 'not a phone', consent: consented, policy: PT_OPEN },
    { phone: REAL, consent: { state: 'objected', segment: null, occurred_at: null, event_id: 'x' }, policy: PT_OPEN },
    { phone: REAL, consent: null, policy: PT_OPEN },
    { phone: REAL, consent: consented, policy: null },
    { phone: REAL, consent: consented, policy: { ...PT_OPEN, confirmed_at: null, confirmed_by: null } },
    { phone: REAL, consent: consented, policy: { ...PT_OPEN, platform_blocked: true } },
  ]
  let refusals = 0
  for (const c of cases) {
    const v = decideGate(c)
    assert.equal(v.permitted, false, `expected a refusal for ${c.phone}`)
    if (!v.permitted) {
      refusals++
      assert.ok(v.detail?.length > 20, `${v.reason} produced no usable detail`)
      assert.ok(GATE_REFUSAL_MEANS[v.reason], `${v.reason} is missing from GATE_REFUSAL_MEANS`)
    }
  }
  assert.equal(refusals, cases.length)
  assert.ok(refusals > 5, 'a vacuous pass proves nothing (§5c)')
})

test('claimed_unevidenced is refused for EVERY policy configuration, by name', () => {
  // The state means the agency asserted something we cannot use. It is not a
  // weaker form of consent, it is a stronger form of nothing -- so no policy
  // row, however permissive or however confirmed, may reach it. Layer 4 refuses
  // before a policy row is read at all, and this asserts that across the whole
  // space of permissive policies rather than against one of them.
  const claimed: ConsentFacts = {
    state: 'claimed_unevidenced', segment: null,
    occurred_at: '2026-09-08T12:25:37.265Z',       // the real quarantined row
    event_id: '29052633-f1c8-4e29-aded-794fed2f07e3',
  }
  const permissive: PolicyRow[] = [
    PT_OPEN,
    { ...PT_OPEN, existing_customer: 'available' },
    { ...PT_OPEN, consent_request: 'permitted' },
    { ...PT_OPEN, consent_expiry_months: null },
    { ...PT_OPEN, obligation_codes: null },
    { ...PT_OPEN, existing_customer: 'available', consent_request: 'permitted', consent_expiry_months: null },
    { ...PT_OPEN, confirmed_at: '2020-01-01T00:00:00Z', confirmed_by: 'a very confident lawyer' },
  ]
  for (const policy of permissive) {
    const v = decideGate({ phone: REAL, consent: claimed, policy })
    assert.equal(v.permitted, false, `claimed_unevidenced was PERMITTED under ${JSON.stringify(policy.existing_customer)}/${policy.consent_request}`)
    if (!v.permitted) {
      assert.equal(v.layer, 'basis', 'it must be refused at layer 4, before policy is consulted')
      assert.equal(v.reason, 'no_ledger_basis')
      assert.match(v.detail, /unevidenced claim/, 'the detail must say it is worth asking the agency about')
    }
  }
})

test('an obligation nothing can discharge turns a permission into a refusal', () => {
  // A lawyer adding "…and you must also do X" to a policy row must not be able
  // to create a duty nothing performs. Proving we knew of an obligation nobody
  // discharges is worse than never recording it.
  const withUnknown: PolicyRow = { ...PT_OPEN, obligation_codes: ['pt_13b_lists', 'es_robinson_screening'] }
  const v = decideGate({ phone: REAL, consent: consented, policy: withUnknown })
  assert.equal(v.permitted, false)
  if (!v.permitted) {
    assert.equal(v.layer, 'policy')
    assert.equal(v.reason, 'obligation_undischargeable')
    assert.match(v.detail, /es_robinson_screening/, 'the refusal must NAME what it did not recognise')
    assert.match(v.detail, /obligations\.ts/, 'and say where to register it')
  }
})

test('a known obligation still permits, and its code travels on the verdict', () => {
  const v = decideGate({ phone: REAL, consent: consented, policy: { ...PT_OPEN, obligation_codes: ['pt_13b_lists'] } })
  assert.equal(v.permitted, true)
  if (v.permitted) assert.deepEqual(v.obligations, ['pt_13b_lists'])
})
