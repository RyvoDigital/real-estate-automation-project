import test from 'node:test'
import assert from 'node:assert/strict'

import {
  dispositionOf, REASON_MEANS, ASK_AFTER_DAYS, ASK_WINDOW_DAYS, INTENT_GRACE_MS,
  type CloseRow, type AskRow, type NotAskedReason,
} from '../src/lib/review/disposition'

/**
 * Every close resolves to exactly one state, and `unaccounted` must be empty.
 *
 * The cases that matter are the three that distinguish a finding from noise:
 * a close nobody tried to send (the finding), a close we were told about too
 * late to act on (not ours), and a party the agency named after the window had
 * closed (theirs, and late). Written as one state they would be
 * indistinguishable, which is how one genuine omission hides among two hundred
 * backfilled rows.
 */

const NOW = new Date('2026-09-19T12:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)
const at = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

const close = (over: Partial<CloseRow> = {}): CloseRow => ({
  closeId: 'c1',
  clientId: 'client1',
  listingReference: 'A-1042',
  partyLeadId: 'lead1',
  partyDeclaredAt: at(-5),
  reportedAt: at(-5),
  agentAskedWhoAt: null,
  closedOn: day(-5),
  ...over,
})

const ask = (over: Partial<AskRow> = {}): AskRow => ({
  closeId: 'c1',
  status: 'sent',
  layer: null,
  reason: null,
  detail: null,
  providerMessageId: 'SM123',
  sentAt: at(-1),
  error: null,
  intentRecordedAt: at(-1),
  ...over,
})

const ctx = (over = {}) => ({ now: NOW, hasReviewDestination: true, ...over })

/** The reason, when the state is not_asked. Fails loudly otherwise. */
const reasonOf = (d: ReturnType<typeof dispositionOf>): NotAskedReason | string => {
  if (d.state !== 'not_asked') return `state was ${d.state}`
  return d.reason
}

// --- asked, and only on the artefact ----------------------------------------

test('a send with a provider message id is asked', () => {
  const d = dispositionOf(close(), [ask()], ctx())
  assert.equal(d.state, 'asked')
  if (d.state !== 'asked') return
  assert.equal(d.providerMessageId, 'SM123')
})

test('🔴 a row claiming sent with no provider id is NOT asked', () => {
  // Rule 13. A status of `sent` with nothing from the wire behind it is a claim
  // about a code path, and this codebase has eighteen recorded instances of
  // something reporting success while the underlying thing failed — here, in
  // the one feature whose entire purpose is not skipping people.
  const d = dispositionOf(close(), [ask({ providerMessageId: null })], ctx())
  assert.equal(d.state, 'unaccounted')
  if (d.state !== 'unaccounted') return
  assert.match(d.detail, /no provider message id/)
})

test('a send belonging to another close is not this close’s evidence', () => {
  const d = dispositionOf(close(), [ask({ closeId: 'somebody-else' })], ctx())
  assert.notEqual(d.state, 'asked')
})

// --- the finding ------------------------------------------------------------

test('🔴 NOTHING TRIED, WINDOW PASSED — the case the whole check exists for', () => {
  // Everything was in place. The window passed. There is no ask and no refusal.
  // Nobody declined to send this; nothing tried.
  const d = dispositionOf(close({ closedOn: day(-20), reportedAt: at(-20), partyDeclaredAt: at(-20) }), [], ctx())
  assert.equal(d.state, 'unaccounted')
  if (d.state !== 'unaccounted') return
  assert.match(d.detail, /Nothing declined to send it; nothing tried/)
})

test('🔴 a backfilled close is NOT that finding', () => {
  // Told on the twentieth day about a sale on the first. There was never a
  // moment at which it could have been asked, and reporting it as an omission
  // would put two hundred rows in front of the one that matters.
  const d = dispositionOf(
    close({ closedOn: day(-40), reportedAt: at(0), partyDeclaredAt: at(0) }), [], ctx())
  assert.equal(reasonOf(d), 'reported_after_window')
  assert.match(String((d as { detail: string }).detail), /Sold on .*reported on/i)
})

test('🔴 a party named after the window is the agency being late, not us', () => {
  const d = dispositionOf(
    close({ closedOn: day(-30), reportedAt: at(-30), partyDeclaredAt: at(-1) }), [], ctx())
  assert.equal(reasonOf(d), 'window_expired')
  assert.match(String((d as { detail: string }).detail), /named on .*after the window closed/)
})

test('deferred by pacing until the window closed is a recorded reason', () => {
  const d = dispositionOf(
    close({ closedOn: day(-30), reportedAt: at(-30), partyDeclaredAt: at(-30) }),
    [ask({ status: 'refused', layer: 'pacing', reason: 'touched_this_week' })],
    ctx())
  assert.equal(reasonOf(d), 'window_expired')
  assert.match(String((d as { detail: string }).detail), /Deferred/)
})

// --- refusals: whose, and how final -----------------------------------------

test('a gate refusal is final and carries the gate’s own words', () => {
  const d = dispositionOf(close(), [ask({
    status: 'refused', layer: 'gate', reason: 'objection_recorded',
    detail: 'This person replied SAIR on 3 March.', providerMessageId: null, sentAt: null,
  })], ctx())
  assert.equal(reasonOf(d), 'gate_refused')
  assert.match(String((d as { detail: string }).detail), /replied SAIR/)
})

test('🔴 a pacing refusal is a DEFERRAL and does not end anything', () => {
  // Collapsing the two layers would report somebody merely touched this week as
  // permanently refused, and would hide the close that ran out of window while
  // the runner kept politely deferring it.
  const d = dispositionOf(close(), [ask({
    status: 'refused', layer: 'pacing', reason: 'touched_this_week',
    providerMessageId: null, sentAt: null,
  })], ctx())
  assert.equal(d.state, 'pending', 'still inside the window, so still eligible')
})

test('a failed send is not asked and is not retried', () => {
  const d = dispositionOf(close(), [ask({
    status: 'failed', providerMessageId: null, sentAt: null, error: 'Twilio 63024',
  })], ctx())
  assert.equal(reasonOf(d), 'send_failed')
  assert.match(String((d as { detail: string }).detail), /63024/)
  assert.match(REASON_MEANS.send_failed, /coin flip/, 'and the record says why not')
})

// --- an intent with no outcome ----------------------------------------------

test('an intent in flight is pending, and one past the grace is unaccounted', () => {
  const inFlight = dispositionOf(close(), [ask({
    status: 'intended', providerMessageId: null, sentAt: null,
    intentRecordedAt: new Date(NOW.getTime() - INTENT_GRACE_MS / 2).toISOString(),
  })], ctx())
  assert.equal(inFlight.state, 'pending')

  const lost = dispositionOf(close(), [ask({
    status: 'intended', providerMessageId: null, sentAt: null,
    intentRecordedAt: new Date(NOW.getTime() - INTENT_GRACE_MS * 3).toISOString(),
  })], ctx())
  assert.equal(lost.state, 'unaccounted')
})

// --- 🔴 the party, and whose silence it is ----------------------------------

test('🔴 asked and unanswered is theirs; never asked is OURS', () => {
  // The requirement that falls out of "if the agent does not say, nothing is
  // asked". Collapsed, the intake could silently fail to prompt the agent and
  // it would read as the agent's silence — the check reporting a clean result
  // about the exact failure it exists to catch.
  const theirs = dispositionOf(
    close({ partyLeadId: null, partyDeclaredAt: null, agentAskedWhoAt: at(-2) }), [], ctx())
  assert.equal(reasonOf(theirs), 'party_not_named')

  const ours = dispositionOf(
    close({ partyLeadId: null, partyDeclaredAt: null, agentAskedWhoAt: null }), [], ctx())
  assert.equal(ours.state, 'unaccounted')
  if (ours.state !== 'unaccounted') return
  assert.match(ours.detail, /The silence is ours, not theirs/)
})

test('not having asked yet is fine before the close comes due', () => {
  const d = dispositionOf(close({
    closedOn: day(-1), reportedAt: at(-1), partyLeadId: null,
    partyDeclaredAt: null, agentAskedWhoAt: null,
  }), [], ctx())
  assert.equal(d.state, 'pending')
})

// --- the agency’s own states ------------------------------------------------

test('an agency with 05 switched off did not run out of time', () => {
  const d = dispositionOf(close(), [], ctx({ agencyDisabled: true }))
  assert.equal(reasonOf(d), 'agency_disabled')
  assert.match(REASON_MEANS.agency_disabled, /may not do is switch it off for one sale/)
})

test('no review link means there is nowhere to send anybody', () => {
  const d = dispositionOf(close(), [], ctx({ hasReviewDestination: false }))
  assert.equal(reasonOf(d), 'no_review_destination')
})

// --- the clock --------------------------------------------------------------

test('before the third day it is pending, and it names both its dates', () => {
  const d = dispositionOf(close({ closedOn: day(-1), reportedAt: at(-1) }), [], ctx())
  assert.equal(d.state, 'pending')
  if (d.state !== 'pending') return
  assert.equal(d.dueOn, day(-1 + ASK_AFTER_DAYS))
  assert.equal(d.expiresOn, day(-1 + ASK_WINDOW_DAYS))
})

test('🔴 the window runs THROUGH its last day, like every other date here', () => {
  // The publication gate treats a certificate as valid through the day it
  // expires and the re-check had to be corrected to agree with it. Three parts
  // of one feature disagreeing by a day is how a close the runner still
  // considers eligible gets reported as expired.
  const onTheLastDay = close({ closedOn: day(-ASK_WINDOW_DAYS), reportedAt: at(-ASK_WINDOW_DAYS), partyDeclaredAt: at(-ASK_WINDOW_DAYS) })
  assert.equal(dispositionOf(onTheLastDay, [], ctx()).state, 'pending',
    'still eligible on the day it expires')

  const theDayAfter = close({ closedOn: day(-ASK_WINDOW_DAYS - 1), reportedAt: at(-ASK_WINDOW_DAYS - 1), partyDeclaredAt: at(-ASK_WINDOW_DAYS - 1) })
  assert.equal(dispositionOf(theDayAfter, [], ctx()).state, 'unaccounted')
})

// --- 🔴 the vocabulary is the structure -------------------------------------

test('🔴 NO REASON CAN EXPRESS A JUDGEMENT ABOUT THE PERSON', () => {
  /*
   * §8.B: pedir a todos é permitido; escolher a quem pedir não é. This is the
   * one place in the system where the tempting act is the KIND one — sparing
   * the unhappy client the request is what a decent person would do by hand,
   * and it is the violation.
   *
   * The defence is that there is no vocabulary for it. A reason meaning "we
   * chose not to ask this one" would have to be ADDED — to this union and to a
   * CHECK constraint — which is a migration and a reviewer rather than a
   * checkbox.
   */
  const JUDGEMENT =
    /\b(unhappy|happy|satisfied|dissatisfied|complain\w*|angry|upset|negative|positive|poor|difficult|sentiment|score|rating|likely|unlikely|opinion|risk\w*)\b/i

  const reasons = Object.keys(REASON_MEANS) as NotAskedReason[]

  /*
   * ⚠️ THE IDENTIFIERS, NOT THE PROSE — and the first version of this test had
   * it wrong in an instructive way.
   *
   * Applied to `REASON_MEANS`, it failed on two entries, and BOTH were honest:
   * `gate_refused` says the refusal is "never about the person's opinion of the
   * agency", and `window_expired` says a late ask is "more likely to produce a
   * perfunctory review". A regex cannot tell USE from MENTION, and prose
   * explaining why we do not screen people must contain the vocabulary of
   * screening to explain it.
   *
   * The identifier is the structure: it is what a caller branches on and what a
   * screening reason would need. The prose is commentary, and contorting it to
   * satisfy a pattern would have made the disclaimer worse — which is the
   * reverse of what the guard is for.
   */
  /*
   * ⚠️ SNAKE_CASE IS NOT WORDS. `\b` counts `_` as a word character, so
   * `/\bunhappy\b/` does not match `client_unhappy` — the guard was blind to
   * the exact shape it inspects, and its self-check is what said so. Third
   * instance this week of a pattern that cannot see part of its own subject.
   */
  const words = (id: string) => id.replace(/_/g, ' ')
  const offences = reasons.filter((r) => JUDGEMENT.test(words(r)))
  assert.deepEqual(offences, [],
    'A reason NAMED for how the client felt is a reason somebody can branch on:\n' +
    offences.map((r) => `  • ${r}`).join('\n'))

  // The guard must be able to SEE what it forbids, or the list is decoration.
  for (const invented of [
    'client_unhappy', 'likely_negative', 'poor_sentiment', 'low_rating_risk',
  ]) {
    assert.ok(JUDGEMENT.test(words(invented)), `the guard cannot see: ${invented}`)
  }

  /*
   * 🔴 AND THIS IS THE ACTUAL STRUCTURAL DEFENCE, stronger than the pattern
   * above because it catches an addition WHATEVER it is called.
   *
   * A seventh reason — however innocently named — fails this line, and the
   * person adding it has to come here and write down what it is for. That is
   * the migration-and-a-reviewer property, and it is worth being exact about
   * where it comes from: the disposition is DERIVED and never stored, so there
   * is no CHECK constraint behind it. This assertion and the closed union are
   * the whole of it.
   */
  assert.equal(reasons.length, 7, 'a new reason needs its own argument, written here')

  /*
   * The seven, and why each one cannot be used to screen. Written because the
   * line above demanded it: `reported_after_window` was added while building
   * this file and the count assertion refused to let it in quietly, on its own
   * author, the same day it was written.
   *
   *   party_not_named        the agency did not answer. A fact about our record
   *   gate_refused           somebody else's refusal, unchanged, decided before
   *                          anyone could know what this person would write
   *   window_expired         a clock
   *   reported_after_window  a clock, and a different one: we were told too
   *                          late to have acted. NOT interchangeable with the
   *                          finding, which is the whole reason it exists
   *   send_failed            the wire said no
   *   agency_disabled        a whole-agency setting. Never per-sale (§6.2)
   *   no_review_destination  there is nowhere to send anybody
   *
   * None of them can be reached by knowing anything about the person, which is
   * the property, and it is checked by reading them rather than by trusting
   * that the pattern above is complete.
   */
})

test('every reason says enough to act on, and none of them says "invalid"', () => {
  for (const [reason, means] of Object.entries(REASON_MEANS)) {
    assert.ok(means.length > 80, `${reason} is too short to act on`)
    assert.doesNotMatch(means, /\binvalid\b|\berror\b|\bfailed to\b|\bnull\b/i, reason)
  }
})

test('the gate’s refusal explicitly disclaims being about the person', () => {
  // The one reason that could be MISREAD as screening, since it is the one that
  // removes people from the list. It says on its face that it is not.
  assert.match(REASON_MEANS.gate_refused, /never about the person/)
  assert.match(REASON_MEANS.gate_refused, /before anybody knows what they would have written/)
})
