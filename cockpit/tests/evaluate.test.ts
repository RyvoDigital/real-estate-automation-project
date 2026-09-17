/*
 * The bulk evaluator — phase 1 of a campaign.
 *
 * Pure, so three hundred contacts are decided here with no database at all —
 * the dividend of decideGate's purity (engineering-lessons §12b).
 *
 * The case that matters most is the Guernsey one: the first version of the
 * evaluator picked policy rows by dialling prefix, which would have handed
 * +447911123456 the United Kingdom's row and permitted a Guernsey contact under
 * PECR. Both ends are now fixed and both are asserted.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCampaign, isTerminalRefusal, type Contact } from '../src/lib/send/evaluate'
import { decideGate, type ConsentFacts } from '../src/lib/gate'
import type { PolicyRow } from '../src/lib/jurisdiction-policy'
import { RESERVED_FIXTURES } from '../src/lib/reserved-numbers'

const confirmedPT: PolicyRow = {
  country: 'PT', existing_customer: 'available', consent_request: 'permitted',
  consent_expiry_months: null, platform_blocked: false, platform_note: null,
  statute: 'Lei n.º 41/2004', authority: 'CNPD', traps: null,
  obligation_codes: ['pt_13b_lists'],
  confirmed_at: '2026-09-20T00:00:00Z', confirmed_by: 'M. de Sousa Pereira',
}
const unconfirmedPT: PolicyRow = { ...confirmedPT, confirmed_at: null, confirmed_by: null }
const confirmedGB: PolicyRow = { ...confirmedPT, country: 'GB', statute: 'PECR 2003' }

const consented: ConsentFacts = {
  state: 'consented', segment: null, occurred_at: '2026-08-01T00:00:00Z', event_id: 'e1',
}
const objected: ConsentFacts = { state: 'objected', segment: null, occurred_at: null, event_id: 'o1' }
const claimed: ConsentFacts = {
  state: 'claimed_unevidenced', segment: null, occurred_at: null, event_id: 'c1',
}

function pt(n: number): string { return `+3519123${String(n).padStart(5, '0')}` }

test('a campaign of 300 produces its shape, and the counts add up', () => {
  // 20 consented, 18 objected, 16 with an unusable claim, 5 unreadable,
  // the rest nothing recorded at all.
  const contacts: Contact[] = []
  const consentByPhone = new Map<string, ConsentFacts>()
  for (let i = 0; i < 300; i++) {
    const phone = i < 5 ? `garbage-${i}` : pt(i)
    contacts.push({ phone })
    if (i >= 5 && i < 25) consentByPhone.set(phone, consented)
    else if (i >= 25 && i < 43) consentByPhone.set(phone, objected)
    else if (i >= 43 && i < 59) consentByPhone.set(phone, claimed)
  }

  const e = evaluateCampaign({
    contacts, consentByPhone,
    policyByCountry: new Map([['PT', confirmedPT]]),
  })

  assert.equal(e.targetCount, 300)
  assert.equal(e.forecastPermitted, 20, 'the consented contacts')
  assert.equal(e.excludedCount, 23, '18 objected + 5 unreadable are terminal')
  assert.equal(e.forecastRefused, 300 - 20 - 23)
  // The constraint in 0018 asserts this too; asserting it here means a broken
  // evaluator fails in the suite rather than at the database.
  assert.equal(e.targetCount, e.excludedCount + e.forecastPermitted + e.forecastRefused)

  assert.equal(e.excludedBreakdown.objected, 18)
  assert.equal(e.excludedBreakdown.unparseable, 5)
  assert.equal(e.refusalBreakdown.no_ledger_basis, 257)
})

test('THE GUERNSEY CASE: a +44 number is not evaluated against the United Kingdom', () => {
  // +447911123456 resolves to GG. The map holds only GB. A prefix lookup would
  // have matched it and permitted a Guernsey contact under PECR.
  const phone = '+447911123456'
  const e = evaluateCampaign({
    contacts: [{ phone }],
    consentByPhone: new Map([[phone, consented]]),
    policyByCountry: new Map([['GB', confirmedGB]]),
  })
  assert.equal(e.forecastPermitted, 0, 'a Guernsey number was permitted under the UK row')
  assert.equal(e.forecastRefused, 1)
  assert.equal(e.refusalBreakdown.no_policy_row, 1, 'GG has no row, so there is no basis')

  // And a real GB number still passes, so the refusal above is about the
  // country rather than about +44.
  const gb = evaluateCampaign({
    contacts: [{ phone: '+447400123456' }],
    consentByPhone: new Map([['+447400123456', consented]]),
    policyByCountry: new Map([['GB', confirmedGB]]),
  })
  assert.equal(gb.forecastPermitted, 1)
})

test('the gate refuses a policy row for the wrong country, whatever the caller did', () => {
  // Defence in depth: even handed the wrong row directly, the gate refuses.
  const v = decideGate({ phone: '+447911123456', consent: consented, policy: confirmedGB })
  assert.equal(v.permitted, false)
  if (!v.permitted) {
    assert.equal(v.reason, 'policy_country_mismatch')
    assert.match(v.detail, /Guernsey/)
  }
})

test('terminal and provisional refusals are separated, and the split is principled', () => {
  for (const r of ['objected', 'unparseable', 'invalid', 'reserved_test_number']) {
    assert.equal(isTerminalRefusal(r), true, `${r} cannot become a permission and must be terminal`)
  }
  for (const r of ['not_confirmed', 'no_ledger_basis', 'existing_customer_unknown',
                   'consent_request_unknown', 'consent_expired', 'no_policy_row']) {
    assert.equal(isTerminalRefusal(r), false,
      `${r} flips when a lawyer confirms, an agency declares, or an import lands — it must be re-asked`)
  }
})

test('an unconfirmed jurisdiction refuses everyone, and none of it is terminal', () => {
  const contacts = [{ phone: pt(1) }, { phone: pt(2) }]
  const e = evaluateCampaign({
    contacts,
    consentByPhone: new Map(contacts.map((c) => [c.phone, consented])),
    policyByCountry: new Map([['PT', unconfirmedPT]]),
  })
  assert.equal(e.forecastPermitted, 0)
  assert.equal(e.refusalBreakdown.not_confirmed, 2)
  assert.equal(e.excludedCount, 0, 'an unconfirmed row is OUR state and will change — never terminal')
})

test('a contact listed twice is one contact', () => {
  const e = evaluateCampaign({
    contacts: [{ phone: pt(1) }, { phone: pt(1) }, { phone: pt(2) }],
    consentByPhone: new Map([[pt(1), consented], [pt(2), consented]]),
    policyByCountry: new Map([['PT', confirmedPT]]),
  })
  assert.equal(e.targetCount, 2, 'a duplicated list must not produce two sends')
  assert.equal(e.forecastPermitted, 2)
})

test('contacts already carrying a terminal refusal are excluded without re-deciding', () => {
  const e = evaluateCampaign({
    contacts: [{ phone: pt(1) }, { phone: pt(2) }],
    consentByPhone: new Map([[pt(1), consented], [pt(2), consented]]),
    policyByCountry: new Map([['PT', confirmedPT]]),
    alreadyTerminal: new Set([pt(2)]),
  })
  assert.equal(e.forecastPermitted, 1)
  assert.equal(e.excludedCount, 1)
  assert.equal(e.excludedBreakdown.already_terminal, 1,
    'the exclusion is counted, not silently dropped')
})

test('reserved fixtures are excluded even with a perfect consent and policy', () => {
  const phone = RESERVED_FIXTURES.consented
  const e = evaluateCampaign({
    contacts: [{ phone }],
    consentByPhone: new Map([[phone, consented]]),
    policyByCountry: new Map([['PT', confirmedPT]]),
  })
  assert.equal(e.forecastPermitted, 0)
  assert.equal(e.excludedBreakdown.reserved_test_number, 1)
})

test('the forecast authorises nothing, and the type says so', () => {
  // Not an assertion about behaviour but about shape: what comes out is a
  // verdict, not a permit. Minting a permit requires SendPermit.record, which
  // takes a fresh verdict — the gate runs again immediately before each send.
  const e = evaluateCampaign({
    contacts: [{ phone: pt(1) }],
    consentByPhone: new Map([[pt(1), consented]]),
    policyByCountry: new Map([['PT', confirmedPT]]),
  })
  const first = e.permitted[0]
  assert.ok(first.verdict.permitted)
  assert.ok(!('sendId' in first.verdict), 'a forecast must not carry anything permit-shaped')
  assert.deepEqual(first.verdict.obligations, ['pt_13b_lists'])
})
