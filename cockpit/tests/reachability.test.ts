import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * DOES ANYTHING CALL IT?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 THIS TEST FAILS TODAY. THAT IS ITS JOB.
 *
 * It is a ledger of entry points nothing reaches, and it gets shorter as they
 * are wired. When the list is empty it passes and stays passing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS, AND WHY NOTHING ELSE COULD HAVE FOUND THIS
 * ───────────────────────────────────────────────────────────────────────────
 * On 20 September 2026 an audit found thirteen entry points across four
 * automations with no caller anywhere outside their own module and this
 * directory. Roughly 660 tests were passing over code that cannot run.
 *
 * Nobody lied and nothing was neglected. EVERY GATE WAS BUILT BEFORE ITS
 * CALLER, DELIBERATELY AND CORRECTLY — you cannot wire a sender to a gate that
 * does not exist. So "no caller yet" was true and expected each time, and
 * nothing ever marked when the *yet* ended. Four features each looked finished
 * on their own terms.
 *
 * 🔒 And no existing check could see it, because of what the existing checks
 * ARE. A unit test supplies its own inputs, so it proves the logic and says
 * nothing about arrival. A migration proves its own preconditions, so it says
 * nothing about whether anything writes the table. Both are honest about what
 * they assert and silent about reachability, and from a dashboard silence and
 * success look identical.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 🔒 WHAT THIS DOES NOT MEAN
 * ───────────────────────────────────────────────────────────────────────────
 * It does not mean the work was wasted. The gates are correct, proved, and
 * exactly what they should be.
 *
 * It means the thing this project has been calling "built to its gate" was
 * true about the GATE and not about the AUTOMATION, and the difference was
 * never written down. From now on there are three states and they are named:
 *
 *   BUILT AND REACHABLE   something calls it, and it runs in production
 *   BUILT AND UNWIRED     it exists, it is tested, nothing calls it
 *   NOT BUILT             it does not exist
 *
 * A handover that says "built" without saying which of the three has not
 * said anything.
 */

const SRC = new URL('../src/', import.meta.url).pathname
const WORKFLOWS = new URL('../../workflows/', import.meta.url).pathname

type EntryPoint = {
  automation: string
  /** The module it lives in, relative to src/lib. Excluded when searching. */
  module: string
  fn: string
  /** What it is, in the terms somebody deciding what to build next needs. */
  what: string
  /** 🔒 What would wire it. Not "it is unwired" — what has to happen. */
  wiredBy: string
}

/*
 * THE LEDGER. Hand-written, deliberately: this is not every export.
 *
 * A helper is legitimately internal, and a check that demanded a caller for
 * every exported function would be noise within a week — the first version of
 * the audit reported four parse functions as unreachable when they are
 * dispatched inside their own module, and a detector with false positives gets
 * suppressed rather than obeyed.
 *
 * So this list is the ENTRY POINTS: the functions that are the top of a path,
 * where a caller is the difference between a feature running and not.
 */
const ENTRY_POINTS: EntryPoint[] = [
  // ── 02 Reactivation ──────────────────────────────────────────────────────
  {
    automation: '02 Reactivation',
    module: 'send/runner.ts',
    fn: 'runCampaign',
    what: 'the thing that actually sends',
    wiredBy:
      'a route or n8n workflow that starts a run — blocked upstream on Meta verification and an approved template, so the caller is not the next thing to build',
  },
  {
    automation: '02 Reactivation',
    module: 'send/campaign-plan.ts',
    fn: 'planCampaign',
    what: 'what a run would do, shown before it does it',
    wiredBy: 'the campaign screen (brief III §4), which is the forecast the operator reads before approving a send',
  },
  {
    automation: '02 Reactivation',
    module: 'send/reconcile.ts',
    fn: 'reconcilePending',
    what: 'the sweep that finds sends the provider accepted and we lost track of',
    wiredBy: 'a scheduled workflow. 🔴 It is the check that finds orphans, so it being unwired is the failure it exists to catch, one level up',
  },
  {
    automation: '02 Reactivation',
    module: 'send/quality.ts',
    fn: 'checkBeforeBatch',
    what: 'the quality halt — it stops a run when the sender rating drops',
    wiredBy: 'runCampaign, once that has a caller. It is a guard on a path nothing walks',
  },

  // ── 03 Listing matching ──────────────────────────────────────────────────
  {
    automation: '03 Listing matching',
    module: 'matching/extract.ts',
    fn: 'extractForLead',
    what: 'reading what a buyer wants out of the conversation they had',
    wiredBy: 'the Concierge run, or a cockpit action on a contact record',
  },
  {
    automation: '03 Listing matching',
    module: 'matching/requirements-store.ts',
    fn: 'recomputeRequirementsForLead',
    what: 'keeping those criteria current as a conversation continues',
    wiredBy: 'the same caller as extractForLead',
  },

  // ── 04 Advertising compliance ────────────────────────────────────────────
  /*
   * ✅ decidePublication CAME OFF THIS LEDGER ON 20 SEPTEMBER 2026 — the first
   * line removed, and the reason it is recorded rather than simply deleted:
   *
   *   wired by  /c/<client>/listings/<id>/publish → decideAndRecord →
   *             decidePublication
   *
   * The screen IS the decision path. `decidePublication` stayed pure and
   * stayed where it was; `decide.ts` assembles the subject, asks it, and keeps
   * the answer in the same act — so a cleared verdict cannot be obtained
   * without the clearance being recorded.
   *
   * Twelve left.
   */
  {
    automation: '04 Advertising compliance',
    module: 'publication/piece.ts',
    fn: 'assemblePiece',
    what: 'the advertisement itself, with its mandatory mentions inside the text',
    wiredBy: 'the prepared-piece screen, which takes a cleared verdict — so it follows the publish screen',
  },
  /*
   * ✅ recheckClearances CAME OFF THIS LEDGER ON 20 SEPTEMBER 2026 — second
   * line, and the one that had been furthest from running:
   *
   *   wired by  /c/<client>/notice → recheckClearances, over the rows 0039
   *             finally gives it
   *
   * It was the most complete piece of unreachable work in the codebase — four
   * lapse causes, nullable dates where a revocation has none, a separate axis
   * for registrations, and a notCheckedFor field so a run given no policy rows
   * cannot report every clearance as unconfirmable. All of it written against
   * an input that did not exist, and its only repo-wide mention outside its
   * own module was a comment.
   *
   * Eleven left.
   */

  // ── 05 Review requests ───────────────────────────────────────────────────
  {
    automation: '05 Review requests',
    module: 'review/runner.ts',
    fn: 'planReviewAsks',
    what: 'who to ask for a review, and who not to',
    wiredBy: 'a scheduled run — blocked upstream on Meta and on a review destination being set',
  },
  {
    automation: '05 Review requests',
    module: 'review/closes-store.ts',
    fn: 'recordClose',
    what: 'an agent reporting that a property sold',
    wiredBy: 'the close-and-party screen (brief II §2.5), which is designed and not built',
  },
  {
    automation: '05 Review requests',
    module: 'review/closes-store.ts',
    fn: 'recordParty',
    what: 'who the buyer was — a second act, by a second person, at a second time',
    wiredBy: 'the close-and-party screen, the same one recordClose needs — a close is born with no party and the answer arrives separately',
  },
  {
    automation: '05 Review requests',
    module: 'review/closes-store.ts',
    fn: 'markAgentAsked',
    what: 'that we asked the agent who the party was',
    wiredBy: 'the close-and-party screen. It is what stops the same agent being asked twice about one sale',
  },
]

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(full)
  }
  return out
}

/**
 * Everything a caller could live in: a page, a route, an action, a component,
 * another lib module, or an n8n workflow.
 *
 * 🔒 Tests are NOT in here, and that is the whole point. A test calling it is
 * what makes it look finished.
 */
function callerSurfaces(exclude: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  for (const f of walk(SRC, ['.ts', '.tsx'])) {
    if (f.endsWith(`/${exclude}`)) continue
    out.push({ name: f.slice(SRC.length), text: readFileSync(f, 'utf8') })
  }
  for (const f of walk(WORKFLOWS, ['.json'])) {
    out.push({ name: `workflows/${f.split('/').pop()}`, text: readFileSync(f, 'utf8') })
  }
  return out
}

/** A mention that is not a comment. Prose about a function is not a caller. */
function referencesOutsideComments(text: string, fn: string): boolean {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ')
  return new RegExp(`\\b${fn}\\b`).test(code)
}

test('🔴 every automation entry point is reached by something that is not a test', () => {
  const unreached: EntryPoint[] = []
  const reached: string[] = []

  for (const e of ENTRY_POINTS) {
    const surfaces = callerSurfaces(e.module.split('/').pop() as string)
    const hit = surfaces.find((s) => referencesOutsideComments(s.text, e.fn))
    if (hit) reached.push(`${e.fn} ← ${hit.name}`)
    else unreached.push(e)
  }

  if (unreached.length === 0) return

  const byAutomation = new Map<string, EntryPoint[]>()
  for (const e of unreached) {
    byAutomation.set(e.automation, [...(byAutomation.get(e.automation) ?? []), e])
  }

  const report = [
    '',
    '  ═══════════════════════════════════════════════════════════════════',
    `  ${unreached.length} ENTRY POINTS ACROSS ${byAutomation.size} AUTOMATIONS HAVE NO CALLER.`,
    '  ═══════════════════════════════════════════════════════════════════',
    '',
    '  These are built, tested and unreachable. Nothing outside their own',
    '  module and the test suite refers to them, so the code cannot run.',
    '',
    '  This is a LEDGER, not a bug. It shrinks as things are wired, and when',
    '  it is empty this test passes and stays passing.',
    '',
  ]
  for (const [automation, entries] of byAutomation) {
    report.push(`  ── ${automation} — ${entries.length} unreached`)
    for (const e of entries) {
      report.push(`     ${e.fn}  (${e.module})`)
      report.push(`         is:      ${e.what}`)
      report.push(`         wired by: ${e.wiredBy}`)
    }
    report.push('')
  }
  if (reached.length) {
    report.push(`  Reached, and removable from the ledger: ${reached.join(', ')}`)
    report.push('')
  }

  assert.fail(report.join('\n'))
})

test('the ledger names what would wire each entry, not only that it is unwired', () => {
  // A gap with no end is indistinguishable from a decision nobody made.
  for (const e of ENTRY_POINTS) {
    assert.ok(e.wiredBy.length > 30, `${e.fn} says nothing about what would wire it`)
    assert.ok(e.what.length > 10, `${e.fn} does not say what it is`)
  }
})

test('the control: the reachability detector finds a caller when there is one', () => {
  // `requireOperator` is called by every page. If the detector cannot see that,
  // every entry above is "unreached" for the wrong reason and the ledger is
  // noise rather than a record.
  const surfaces = callerSurfaces('auth.ts')
  assert.ok(
    surfaces.some((s) => referencesOutsideComments(s.text, 'requireOperator')),
    'the detector cannot see a function that is called everywhere — it is broken, not the code',
  )
  // And prose about a function is not a caller.
  assert.equal(referencesOutsideComments('/* calls decidePublication */', 'decidePublication'), false)
  assert.equal(referencesOutsideComments('const v = decidePublication(s)', 'decidePublication'), true)
})
