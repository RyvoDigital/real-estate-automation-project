import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  validateCloseReport, validatePartyDeclaration, partyRecord, whoToAskPrompt,
  type CloseReport, type PartyDeclaration,
} from '../src/lib/review/close-intake'

const TODAY = '2026-09-19'

const report = (over: Partial<CloseReport> = {}): CloseReport => ({
  clientId: 'client1', listingId: 'l1', closedOn: '2026-09-18',
  reportedBy: 'A. Ferreira', source: 'whatsapp', rawMessage: 'A-1042 vendido', ...over,
})

const decl = (over: Partial<PartyDeclaration> = {}): PartyDeclaration => ({
  closeId: 'c1', leadId: 'lead1', role: 'buyer',
  declaredBy: 'A. Ferreira', recordedBy: 'manuel@ryvodigital.com', ...over,
})

// --- the close --------------------------------------------------------------

test('a complete report is accepted', () => {
  assert.equal(validateCloseReport(report(), TODAY), null)
})

test('a close with no listing is accepted, because that sale still happened', () => {
  assert.equal(validateCloseReport(report({ listingId: null }), TODAY), null)
})

test('a sale dated in the future is refused before the constraint refuses it', () => {
  // The database would refuse it by constraint name. A person reads this.
  const r = validateCloseReport(report({ closedOn: '2026-09-20' }), TODAY)
  assert.match(String(r), /has not completed is not a close/)
  assert.match(String(r), /window that never opens/)
})

test('today is not the future', () => {
  assert.equal(validateCloseReport(report({ closedOn: TODAY }), TODAY), null)
})

test('a report with no date or no reporter is refused, and says why it matters', () => {
  assert.match(String(validateCloseReport(report({ closedOn: '18/09/2026' }), TODAY)), /YYYY-MM-DD/)
  assert.match(String(validateCloseReport(report({ reportedBy: '  ' }), TODAY)), /arrived from nobody/)
})

// --- 🔴 the party -----------------------------------------------------------

test('a complete declaration is accepted and records both people', () => {
  assert.equal(validatePartyDeclaration(decl()), null)
  const r = partyRecord(decl())
  assert.equal(r.declared_by, 'A. Ferreira')
  assert.equal(r.recorded_by, 'manuel@ryvodigital.com')
  assert.ok(r.at)
})

test('🔴 the declaration date comes from the clock and cannot be supplied', () => {
  /*
   * ⚠️ WRITTEN AFTER AN EMPTY SABOTAGE PREDICTION HELD.
   *
   * The test above said "the date is set here, so nobody can pass one they
   * chose" and asserted only that `at` was truthy — which it is either way.
   * Letting the caller supply `at` broke nothing, so the sentence was a comment
   * pretending to be a check.
   *
   * It matters more here than it looks: `at` is when the agency declared a
   * lawful basis. A date the declarer chooses is not a record of when they
   * declared it, and this one would be reached for the first time by somebody
   * backfilling.
   */
  const fixed = partyRecord(decl(), new Date('2020-05-04T09:00:00Z'))
  assert.equal(fixed.at, '2020-05-04T09:00:00.000Z', 'it comes from the clock it was handed')

  const smuggled = partyRecord(
    { ...decl(), at: '1999-01-01T00:00:00.000Z' } as PartyDeclaration,
    new Date('2026-09-19T12:00:00Z'),
  )
  assert.equal(smuggled.at, '2026-09-19T12:00:00.000Z',
    'a date on the declaration is ignored, not preferred')
})

test('🔴 the agency declares and we record — never the same person', () => {
  // Sharper here than on the segmentation screen: naming the party to a
  // completed sale IS the segment A declaration, and segment A is a lawful
  // basis. One person doing both means the system produces its own permission.
  const r = validatePartyDeclaration(decl({ declaredBy: 'manuel@ryvodigital.com' }))
  assert.match(String(r), /cannot be the same person/)
  assert.match(String(r), /producing its own\s+permission to send/)
})

test('the same-person check ignores case and spacing, as a typed name would', () => {
  assert.ok(validatePartyDeclaration(decl({ declaredBy: '  MANUEL@ryvodigital.com ' })))
})

test('a declaration with no party, no role or no declarer is refused', () => {
  assert.match(String(validatePartyDeclaration(decl({ leadId: '' }))), /not inferred from the property/)
  assert.match(String(validatePartyDeclaration({ ...decl(), role: 'landlord' as 'buyer' })), /bought or sold/)
  assert.match(String(validatePartyDeclaration(decl({ declaredBy: ' ' }))), /statement about a lawful basis/)
  assert.match(String(validatePartyDeclaration(decl({ recordedBy: '' }))), /who is entering this/)
})

test('🔴 the role is never guessed from the property', () => {
  // A sale has two parties. Which of them the agency has a relationship with
  // varies by sale, and asking the wrong one produces a review from somebody
  // with nothing to say.
  const src = readFileSync(resolve(process.cwd(), 'src/lib/review/close-intake.ts'), 'utf8')
  assert.doesNotMatch(src, /default.*['"](buyer|seller)['"]|role\s*[?=]{1,3}\s*['"](buyer|seller)['"]/)
})

// --- 🔴 the prompt ----------------------------------------------------------

test('🔴 the prompt offers no default and names nobody', () => {
  // Proposing "was it the buyer?" collects a tap, and the tap would be recorded
  // as the agency's statement about which of their own clients to approach.
  const p = whoToAskPrompt('A-1042')
  assert.match(p, /A-1042/)
  assert.match(p, /o comprador ou o vendedor/, 'both, in one question, neither first by design')
  assert.doesNotMatch(p, /\bSIM\b|responda 1|toque em/i, 'nothing tappable that could stand in for a name')
  assert.match(p, /Responda com o nome da pessoa/)
})

test('the prompt says what happens if they do not reply', () => {
  // The honest answer is also the one most likely to produce a reply.
  assert.match(whoToAskPrompt('A-1042'), /não pedimos opinião a ninguém/)
})

test('a close with no reference still produces a sentence somebody can answer', () => {
  const p = whoToAskPrompt(null)
  assert.match(p, /desta venda/)
  assert.doesNotMatch(p, /null|undefined/)
})

// --- 🔴 the store’s failure mode is chosen, not inherited --------------------

test('🔴 THE BASIS IS WRITTEN BEFORE THE PARTY, and the order is load-bearing', () => {
  /*
   * Two writes, no transaction across PostgREST calls, so one can land alone —
   * which means WHICH one lands alone is a decision.
   *
   * Basis first: a failure leaves a ledger row and a close with no party, so
   * nothing is sent and a person re-enters it. The other way round leaves a
   * party the automation believes it may message with nothing saying why,
   * which is the worst row this system can hold.
   */
  const src = readFileSync(resolve(process.cwd(), 'src/lib/review/closes-store.ts'), 'utf8')
  const basis = src.indexOf("from('consent_events')")
  const party = src.indexOf('party_lead_id: rec.lead_id')
  assert.ok(basis > 0 && party > 0, 'both writes are present')
  assert.ok(basis < party, 'the basis is written first — see the comment above it')
  assert.match(src, /BASIS FIRST, then the party/)
})

test('🔴 a lead with no usable number is refused rather than half-recorded', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/lib/review/closes-store.ts'), 'utf8')
  assert.match(src, /\^\\\+\[1-9\]\[0-9\]\{6,14\}\$/, 'the same E.164 shape the ledger constrains')
  assert.match(src, /could never lawfully message/)
})

test('a sale reported twice is ordinary, not a failure', () => {
  // The agent sends "A-1042 vendido" again. The unique index refuses it and the
  // store reads the existing row back.
  const src = readFileSync(resolve(process.cwd(), 'src/lib/review/closes-store.ts'), 'utf8')
  assert.match(src, /error\?\.code === '23505'/)
  assert.match(src, /must not look like a failure/)
})

test('🔴 nothing in the intake can send', () => {
  for (const f of ['src/lib/review/close-intake.ts', 'src/lib/review/closes-store.ts']) {
    const src = readFileSync(resolve(process.cwd(), f), 'utf8')
    for (const forbidden of ['dispatch', 'twilio', 'adapter', 'permit', 'runner']) {
      assert.doesNotMatch(src, new RegExp(`from '[^']*${forbidden}`, 'i'), `${f}: ${forbidden}`)
    }
  }
})
