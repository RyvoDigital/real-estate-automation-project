import test from 'node:test'
import assert from 'node:assert/strict'

import {
  reconcileAsks, explainTheGap, LIMITS, type OmissionReport,
} from '../src/lib/review/reconcile-asks'
import type { AskRow, CloseRow } from '../src/lib/review/disposition'

/**
 * The reconciliation: every close accounted for, and the residue handed over.
 *
 * The assertions that matter are the arithmetic (nothing may fall between the
 * buckets), the gap being EXPLAINED rather than hidden, and an unrun check
 * being distinguishable from a clean one.
 */

const NOW = new Date('2026-09-19T12:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)
const at = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

let n = 0
const close = (over: Partial<CloseRow> = {}): CloseRow => ({
  closeId: `c${++n}`,
  clientId: 'client1',
  listingReference: `A-10${n}`,
  partyLeadId: 'lead1',
  partyDeclaredAt: at(-5),
  reportedAt: at(-5),
  agentAskedWhoAt: null,
  closedOn: day(-5),
  ...over,
})

const ask = (closeId: string, over: Partial<AskRow> = {}): AskRow => ({
  closeId,
  status: 'sent',
  layer: null, reason: null, detail: null,
  providerMessageId: 'SM1', sentAt: at(-1), error: null, intentRecordedAt: at(-1),
  ...over,
})

const ctx = (over = {}) => ({ now: NOW, hasReviewDestination: true, ...over })
const ok = (r: OmissionReport) => {
  assert.equal(r.checked, true)
  if (!r.checked) throw new Error('unreachable')
  return r
}

// --- the arithmetic ---------------------------------------------------------

test('🔴 every close lands in exactly one bucket, and the totals add up', () => {
  const asked = close()
  const refused = close()
  const stillPending = close({ closedOn: day(-1), reportedAt: at(-1) })
  const skipped = close({ closedOn: day(-30), reportedAt: at(-30), partyDeclaredAt: at(-30) })

  const r = ok(reconcileAsks([asked, refused, stillPending, skipped], [
    ask(asked.closeId),
    ask(refused.closeId, {
      status: 'refused', layer: 'gate', reason: 'objection_recorded',
      detail: 'Replied SAIR.', providerMessageId: null, sentAt: null,
    }),
  ], ctx()))

  assert.equal(r.closes, 4)
  assert.equal(r.asked, 1)
  assert.equal(r.pending, 1)
  assert.equal(r.notAskedTotal, 1)
  assert.equal(r.unaccounted.length, 1)
  assert.equal(r.asked + r.pending + r.notAskedTotal + r.unaccounted.length, r.closes,
    'nothing may fall between the buckets')
})

test('the finding names the property and the date, or nobody can act on it', () => {
  const skipped = close({ closedOn: day(-30), reportedAt: at(-30), partyDeclaredAt: at(-30), listingReference: 'A-999' })
  const r = ok(reconcileAsks([skipped], [], ctx()))
  assert.equal(r.unaccounted[0].listingReference, 'A-999')
  assert.equal(r.unaccounted[0].closedOn, day(-30))
  assert.match(r.unaccounted[0].detail, /nothing tried/)
})

test('the oldest omission is first, because it has been unasked longest', () => {
  const old = close({ closedOn: day(-200), reportedAt: at(-200), partyDeclaredAt: at(-200), listingReference: 'OLD' })
  const recent = close({ closedOn: day(-20), reportedAt: at(-20), partyDeclaredAt: at(-20), listingReference: 'NEW' })
  const r = ok(reconcileAsks([recent, old], [], ctx()))
  assert.deepEqual(r.unaccounted.map((u) => u.listingReference), ['OLD', 'NEW'])
})

test('refusals are grouped by reason, commonest first, and carry their meaning', () => {
  /*
   * ⚠️ The counts are deliberately the way round that ALPHABETICAL ordering
   * would get wrong. The first version used three `gate_refused` and one
   * `party_not_named` — which sort identically by count and by name, so the
   * assertion passed under a sort it was written to refuse. The commonest
   * reason is the one worth a conversation with the agency, and the order has
   * to prove it is ordering by that.
   */
  const unnamed = [1, 2, 3].map(() =>
    close({ partyLeadId: null, partyDeclaredAt: null, agentAskedWhoAt: at(-2) }))
  const gated = close()
  const r = ok(reconcileAsks([...unnamed, gated], [ask(gated.closeId, {
    status: 'refused', layer: 'gate', reason: 'no_basis', detail: 'Segment D.',
    providerMessageId: null, sentAt: null,
  })], ctx()))

  assert.deepEqual(r.notAsked.map((x) => [x.reason, x.count]),
    [['party_not_named', 3], ['gate_refused', 1]],
    'by count — and note that by NAME this order is reversed')
  assert.ok(r.notAsked[0].means.length > 80, 'the screen can print the reason without a lookup')
})

// --- 🔴 the gap is explained, never hidden ----------------------------------

test('🔴 the gap between closes and asks is ACCOUNTED FOR, line by line', () => {
  // Somebody will see a review list shorter than a sales list and try to close
  // the difference. Closing it is the offence. A discrepancy that is displayed
  // and explained does not get investigated as a defect.
  const asked = close()
  const suppressed = close()
  const noSegment = close()
  const r = ok(reconcileAsks([asked, suppressed, noSegment], [
    ask(asked.closeId),
    ask(suppressed.closeId, { status: 'refused', layer: 'gate', reason: 'objection_recorded', detail: 'SAIR.', providerMessageId: null, sentAt: null }),
    ask(noSegment.closeId, { status: 'refused', layer: 'gate', reason: 'no_basis', detail: 'Segment D.', providerMessageId: null, sentAt: null }),
  ], ctx()))

  const gap = explainTheGap(r)
  assert.equal(gap.closes, 3)
  assert.equal(gap.asked, 1)
  assert.equal(gap.difference, 2)
  assert.equal(gap.fullyExplained, true, 'every one of the difference has a named reason')
  assert.equal(gap.unexplained, 0)
  assert.equal(gap.lines.reduce((n, l) => n + l.count, 0), 2)
})

test('an unexplained gap is reported as unexplained rather than quietly balanced', () => {
  const skipped = close({ closedOn: day(-30), reportedAt: at(-30), partyDeclaredAt: at(-30) })
  const gap = explainTheGap(ok(reconcileAsks([skipped], [], ctx())))
  assert.equal(gap.difference, 1)
  assert.equal(gap.lines.length, 0, 'no reason exists for it, because none was recorded')
  assert.equal(gap.fullyExplained, false,
    'and the screen must not say the gap is explained when one of it is not')
  assert.equal(gap.unexplained, 1)
})

// --- 🔴 unrun is not clean --------------------------------------------------

test('🔴 not being given the sends is not a clean bill', () => {
  // An empty omissions list would read as "nobody was skipped" when what is
  // true is "nothing was compared" — a page of findings, or a clean result,
  // from a missing argument. Lesson 5k, in a check whose whole output is a
  // list that is supposed to be empty.
  const r = reconcileAsks([close(), close()], undefined, ctx())
  assert.equal(r.checked, false)
  if (r.checked) return
  assert.match(r.why, /not a clean result/i)
})

test('🔴 being given NO sends is a real state, and every close is genuinely unasked', () => {
  // undefined and [] are different. At the start of an agency's life there are
  // no sends and that is true rather than missing.
  const skipped = close({ closedOn: day(-30), reportedAt: at(-30), partyDeclaredAt: at(-30) })
  const r = ok(reconcileAsks([skipped], [], ctx()))
  assert.equal(r.unaccounted.length, 1)
})

test('no closes at all is checked, empty, and not an error', () => {
  const r = ok(reconcileAsks([], [], ctx()))
  assert.equal(r.closes, 0)
  assert.deepEqual(r.unaccounted, [])
})

// --- 🔴 the limits travel with the result -----------------------------------

test('🔴 the report carries what it CANNOT see, in its own return value', () => {
  const r = ok(reconcileAsks([close()], [], ctx()))
  assert.ok(r.limits.length >= 4)
  // The sentence that stops a clean report being read as a guarantee.
  const theSentence = r.limits.find((l) => /did not skip anybody we were TOLD about/.test(l))
  assert.ok(theSentence, 'the limit that matters most is missing')
  assert.match(String(theSentence), /cannot prove the agency did not skip somebody by not telling us/)
})

test('the limits are a copy, so a caller cannot edit the list for everyone', () => {
  const r = ok(reconcileAsks([close()], [], ctx()))
  r.limits.push('we can see everything')
  assert.equal(LIMITS.length, 5, 'the shared list is untouched')
})

test('🔴 nothing here can send, and the module says so by what it imports', async () => {
  const src = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/lib/review/reconcile-asks.ts', import.meta.url), 'utf8'))
  // A reconciliation that could send would be tempted, on finding somebody
  // unasked, to ask them — six weeks late, outside every window.
  for (const forbidden of ['dispatch', 'twilio', 'adapter', 'permit', 'send-store', 'server-only']) {
    assert.doesNotMatch(src, new RegExp(`from '[^']*${forbidden}`, 'i'), forbidden)
  }
  assert.match(src, /imports no dispatcher/, 'and it says why, where the next person will read it')
})
