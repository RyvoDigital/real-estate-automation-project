import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve as rp } from 'node:path'
import { readdirSync } from 'node:fs'

import { planReviewAsks, type AskCandidate } from '../src/lib/review/runner'
import { dispositionOf, type AskRow, type CloseRow } from '../src/lib/review/disposition'
import type { PolicyRow } from '../src/lib/jurisdiction-policy'

const NOW = new Date('2026-09-19T12:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)
const at = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

let n = 0
const close = (over: Partial<CloseRow> = {}): CloseRow => ({
  closeId: `c${++n}`, clientId: 'client1', listingReference: `A-${n}`,
  partyLeadId: 'lead1', partyDeclaredAt: at(-6), reportedAt: at(-6),
  agentAskedWhoAt: null, closedOn: day(-6), ...over,
})

const PT: PolicyRow = {
  country: 'PT',
  existing_customer: 'available',
  consent_request: 'permitted',
  consent_expiry_months: null,
  platform_blocked: false,
  platform_note: null,
  statute: 'Lei n.º 41/2004, art. 13.º',
  authority: 'CNPD',
  traps: null,
  obligation_codes: [],
  confirmed_at: '2026-09-01',
  confirmed_by: 'M. de Sousa Pereira',
}

const candidate = (over: Partial<AskCandidate> = {}): AskCandidate => ({
  close: close(),
  phone: '+351912345678',
  consent: { state: 'declared', segment: 'A', occurred_at: '2026-01-01', event_id: 'e1' },
  policy: PT,
  history: { sentAt: [] },
  ...over,
})

const ctx = (over = {}) => ({ now: NOW, hasReviewDestination: true, sentToday: 0, ...over })
const acts = (p: ReturnType<typeof planReviewAsks>) => p.planned.map((x) => x.act)

// --- 🔴 the boundary --------------------------------------------------------

test('🔴 THE RUNNER CANNOT REACH A DISPATCHER, AND NOR CAN ANYTHING BESIDE IT', () => {
  /*
   * 04's F4 pattern: build the decision, hold the act, and let a source-level
   * test prove it. This is not staging to be undone when Meta approves — the
   * day somebody wires a send into `src/lib/review/`, this fails with a
   * filename.
   *
   * The whole DIRECTORY is swept rather than the runner alone, because the
   * tempting place to put a send is a new file next to it.
   */
  const dir = rp(process.cwd(), 'src/lib/review')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
  assert.ok(files.length >= 5, 'the sweep found suspiciously few files')

  const offences: string[] = []
  for (const f of files) {
    for (const spec of importsOf(readFileSync(rp(dir, f), 'utf8'))) {
      const hit = FORBIDDEN.find((w) => spec.toLowerCase().includes(w))
      if (hit) offences.push(`${f} imports ${spec}`)
    }
  }
  assert.deepEqual(offences, [], offences.join('\n'))
})

const FORBIDDEN = ['dispatch', 'twilio', 'adapter', 'provider-', 'send-store', 'permit']

/**
 * Every module specifier this file imports, by any route.
 *
 * ⚠️ TWO WRONG VERSIONS BEFORE THIS ONE, AND BOTH FAILED THE SAME WAY: they
 * scanned the source for a forbidden word sitting inside quotes, which is what
 * an import specifier looks like — and is also what a great many other things
 * look like.
 *
 *   1. Over the whole file, an APOSTROPHE IN PROSE opens a quote. `04's F4
 *      pattern … cannot reach a dispatcher` reads as a quoted string, and four
 *      of five modules were flagged by sentences saying they do not do the
 *      thing. A guard failing on its own disclaimer, twice in two days.
 *
 *   2. With comments stripped, it still flagged `runner.ts` for `permit` —
 *      because A REGEX CANNOT TELL A CLOSING QUOTE FROM AN OPENING ONE. The
 *      text between the `'` that ends `'gate'` and the `'` that begins
 *      `'defer'` contains `p.permitted`, and the pattern read that gap as a
 *      string.
 *
 * The subject was never "quoted text". It is the specifier of an import, and
 * there are exactly four ways to write one. Matching those is both narrower and
 * complete, and it cannot be confused by anything that is not an import.
 *
 * §1n, third instance: the guard ran, passed nothing, and was measuring
 * something other than its subject.
 */
function importsOf(src: string): string[] {
  const re = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`]([^'"`]+)['"`]/g
  return [...src.matchAll(re)].map((m) => m[1])
}

test('🔴 the boundary guard sees every way to write an import', () => {
  // A guard that has never been shown to match anything is indistinguishable
  // from one that matches everything it should — and this one has now been
  // wrong twice, so its cases are asserted before it is trusted.
  const seen = importsOf([
    `import { dispatch } from '@/lib/send/dispatch'`,
    `import '@/lib/send/twilio-adapter'`,
    `const a = require('@/lib/send/send-store')`,
    `await import('@/lib/send/provider-reader')`,
  ].join('\n'))
  assert.deepEqual(seen, [
    '@/lib/send/dispatch', '@/lib/send/twilio-adapter',
    '@/lib/send/send-store', '@/lib/send/provider-reader',
  ], 'a bare import and a dynamic import both walk past a `from`-only pattern')
  for (const spec of seen) {
    assert.ok(FORBIDDEN.some((w) => spec.includes(w)), spec)
  }

  // And the two things that fooled the earlier versions are not imports.
  assert.deepEqual(importsOf(`/* 04's F4: cannot reach a dispatcher. */`), [])
  assert.deepEqual(importsOf(`act: 'gate', x: p.permitted, y: 'defer'`), [])
})

test('the plan is data, and carries no way to act on itself', () => {
  const p = planReviewAsks([candidate()], [], ctx())
  for (const item of p.planned) {
    for (const v of Object.values(item)) {
      assert.notEqual(typeof v, 'function', 'a plan item holding a function is a plan that can run')
    }
  }
})

// --- 🔴 one definition of due -----------------------------------------------

test('🔴 the runner asks the disposition what is a candidate, never decides again', () => {
  // Two definitions of "due" would disagree about WHO GOT ASKED — the screen
  // reporting an omission the runner cannot see, or the runner sending to
  // somebody the screen counts as refused. Lesson 15, with consequences.
  const src = readFileSync(rp(process.cwd(), 'src/lib/review/runner.ts'), 'utf8')
  assert.match(src, /dispositionOf\(/)
  assert.doesNotMatch(src, /ASK_AFTER_DAYS|ASK_WINDOW_DAYS/,
    'the windows live in one place and this is not it')
})

test('a close that is not yet due is skipped, and says until when', () => {
  const p = planReviewAsks([candidate({ close: close({ closedOn: day(-1), reportedAt: at(-1), partyDeclaredAt: at(-1) }) })], [], ctx())
  assert.deepEqual(acts(p), ['skip'])
  assert.match(String((p.planned[0] as { why: string }).why), /Not due until/)
})

test('a close already asked, refused or expired is skipped as already accounted', () => {
  const c = candidate()
  const sent: AskRow = {
    closeId: c.close.closeId, status: 'sent', layer: null, reason: null, detail: null,
    providerMessageId: 'SM1', sentAt: at(-1), error: null, intentRecordedAt: at(-1),
  }
  const p = planReviewAsks([c], [sent], ctx())
  assert.deepEqual(acts(p), ['skip'])
  assert.match(String((p.planned[0] as { why: string }).why), /Already asked/)
})

test('a close with no party is skipped rather than guessed at', () => {
  const p = planReviewAsks(
    [candidate({ close: close({ partyLeadId: null, partyDeclaredAt: null, agentAskedWhoAt: at(-2) }) })],
    [], ctx())
  assert.deepEqual(acts(p), ['skip'])
})

// --- 🔴 the gate, on every one ----------------------------------------------

test('🔴 a permitted contact is planned, with the gate’s basis attached', () => {
  const p = planReviewAsks([candidate()], [], ctx())
  assert.deepEqual(acts(p), ['ask'])
  const a = p.planned[0] as { basis: string; phone: string }
  assert.ok(a.basis.length > 0, 'the permission carries its reason, never a bare true')
  assert.equal(a.phone, '+351912345678')
})

test('🔴 a suppressed contact is refused, and the gate’s own words travel', () => {
  const p = planReviewAsks([candidate({
    consent: { state: 'objected', segment: null, occurred_at: '2026-02-02', event_id: 'e2' },
  })], [], ctx())
  assert.deepEqual(acts(p), ['refuse'])
  const r = p.planned[0] as { layer: string; detail: string }
  assert.equal(r.layer, 'gate')
  assert.ok(r.detail.length > 40, 'the refusal is actionable, not a code')
})

test('🔴 a reserved test number never receives a review request either', () => {
  // The gate's first layer, and it must hold for a NEW automation without
  // anybody remembering to add it.
  const p = planReviewAsks([candidate({ phone: '+15005550006' })], [], ctx())
  assert.deepEqual(acts(p), ['refuse'])
})

test('🔴 an unreachable jurisdiction refuses, rather than defaulting to Portugal', () => {
  const p = planReviewAsks([candidate({ policy: null })], [], ctx())
  assert.deepEqual(acts(p), ['refuse'])
})

// --- 🔴 pacing is a deferral, not a refusal ---------------------------------

test('🔴 a contact touched this week is DEFERRED, not refused', () => {
  // Recording it as final would end an ask that has not run out of window.
  const p = planReviewAsks([candidate({
    history: { sentAt: [at(-2)] },
  })], [], ctx())
  assert.deepEqual(acts(p), ['defer'])
  assert.equal((p.planned[0] as { layer: string }).layer, 'pacing')
})

test('🔴 the daily cap is counted FORWARD across the run', () => {
  // The client's day is shared with 02 and 03 and is spent in the order this
  // loop runs. Counting only the starting total would let one run plan thirty
  // more on top of thirty already sent.
  const many = Array.from({ length: 4 }, () => candidate())
  const p = planReviewAsks(many, [], ctx({ sentToday: 28 }))
  assert.deepEqual(acts(p), ['ask', 'ask', 'defer', 'defer'],
    'two fit under the cap of thirty and the rest are deferred, not refused')
})

test('the counts in the plan match what is in it', () => {
  const p = planReviewAsks([
    candidate(),
    candidate({ consent: { state: 'objected', segment: null, occurred_at: '2026-02-02', event_id: 'e2' } }),
    candidate({ history: { sentAt: [at(-2)] } }),
    candidate({ close: close({ closedOn: day(-1), reportedAt: at(-1), partyDeclaredAt: at(-1) }) }),
  ], [], ctx())
  assert.equal(p.asks, 1)
  assert.equal(p.refusals, 1)
  assert.equal(p.deferrals, 1)
  assert.equal(p.skipped, 1)
  assert.equal(p.asks + p.refusals + p.deferrals + p.skipped, p.planned.length)
})

// --- 🔴 not in service ------------------------------------------------------

test('🔴 with no approved template, nothing is asked and it is not an omission', () => {
  const p = planReviewAsks([candidate()], [], ctx({ inServiceFrom: null }))
  assert.deepEqual(acts(p), ['skip'], 'the disposition already accounts for it')
})

test('🔴 entering service does NOT turn earlier closes into omissions', () => {
  /*
   * The backfill mistake with the sign reversed: a change in OUR state
   * rewriting the history of what we did about theirs. A close whose window ran
   * before we had a template was never ours to send, and Meta approving one in
   * October must not make September look like negligence.
   */
  const old = close({ closedOn: day(-60), reportedAt: at(-60), partyDeclaredAt: at(-60) })

  /*
   * ⚠️ ASSERTED ON THE DISPOSITION, NOT ON THE RUNNER'S ACT.
   *
   * The first version checked only that the runner skipped it — and the runner
   * skips an OMISSION too, so it passed whether the close read `not_in_service`
   * or `unaccounted`. The distinction the test is named for was the one thing
   * it could not see. Found by a sabotage that disabled the date comparison and
   * broke nothing.
   */
  const d = dispositionOf(old, [], { now: NOW, hasReviewDestination: true, inServiceFrom: day(-5) })
  assert.equal(d.state, 'not_asked')
  if (d.state !== 'not_asked') return
  assert.equal(d.reason, 'not_in_service', 'NOT unaccounted — this was never ours to send')
  assert.match(d.detail, /In service from/)

  // And the runner leaves it alone, which it would also do if it were an
  // omission — which is why the line above is the one that matters.
  assert.deepEqual(acts(planReviewAsks([candidate({ close: old })], [], ctx({ inServiceFrom: day(-5) }))), ['skip'])
})
