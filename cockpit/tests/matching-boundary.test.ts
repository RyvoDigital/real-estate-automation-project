/*
 * AN AGENT'S PREFERENCE IS NOT A CONTACT'S OBJECTION, AND THIS IS THE FILE
 * THAT KEEPS THEM APART.
 *
 * `listing_matches.outcome` carries `agent_dismissed_lead` — "stop showing me
 * this person". It is a WORKING PREFERENCE held by an agent about their own
 * candidate list. An objection is a different thing entirely: permanent, owned
 * by the contact, recorded in the consent ledger because a person asked for it.
 *
 * If the two ever merge, an agent's convenience becomes a permanent legal state
 * on somebody who never asked for it — and it would be invisible, because both
 * produce exactly the same silence.
 *
 * 0025's header names three safeguards. Two are in the migration: they are
 * different tables, and the vocabulary does not invite the merge. A migration
 * cannot carry the third, which is this — and it was registered in the proof
 * book as BLOCKED, waiting for a matching run to exist, precisely so it could
 * not be quietly skipped once one did.
 *
 * It is a BOUNDARY, NOT A BAN. The candidate-set query is exactly where
 * `listing_matches` SHOULD be read, because that is what the agent meant. What
 * must never read it is the path that decides whether a person may be messaged.
 *
 * And the reverse direction, which is the subtler one: the matching run must
 * not consult the gate, the ledger or the suppression list either. Who may be
 * contacted is asked at SEND time; asking it while matching would build a
 * second, quieter gate out of a filter, and a lead would vanish from an agent's
 * screen for a reason nobody reported.
 *
 * engineering-lessons §12: prefer a boundary to a rule. A rule is advice. A
 * test that names the offending file is an obstacle.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(new URL('../..', import.meta.url).pathname)

/** The path that decides whether a person may be messaged. */
const GATE_PATH = [
  'cockpit/src/lib/gate.ts',
  'cockpit/src/lib/gate-read.ts',
  'cockpit/src/lib/suppression.ts',
  'cockpit/src/lib/jurisdiction.ts',
  'cockpit/src/lib/jurisdiction-policy.ts',
  'cockpit/src/lib/send/evaluate.ts',
  'cockpit/src/lib/send/permit.ts',
  'cockpit/src/lib/send/dispatch.ts',
]

/** The matching run, which decides who a listing is FOR. */
const MATCHING_PATH = [
  'cockpit/src/lib/matching/run.ts',
  'cockpit/src/lib/matching/run-store.ts',
  'cockpit/src/lib/matching/score.ts',
  'cockpit/src/lib/matching/extract.ts',
  'cockpit/src/lib/matching/recency.ts',
  'cockpit/src/lib/matching/recompute.ts',
  'cockpit/src/lib/matching/requirements-store.ts',
]

function read(rel: string): string | null {
  const p = resolve(REPO, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

/**
 * Every listed file must EXIST, or this whole check is an empty-set pass.
 *
 * §7 in miniature: a boundary asserted over files that are not there passes
 * identically to one where nothing crosses it. A rename would otherwise turn
 * this test green by deleting its subject.
 */
test('the boundary check can see both sides of the boundary', () => {
  for (const f of [...GATE_PATH, ...MATCHING_PATH]) {
    assert.ok(
      read(f) !== null,
      `${f} is listed in the boundary check and does not exist. Either it moved — ` +
        'update the list — or the check is passing over nothing.',
    )
  }
})

test('nothing on the gate path reads listing_matches', () => {
  const offenders: string[] = []
  for (const f of GATE_PATH) {
    const src = read(f)
    if (src && /listing_matches|listing-matches|agent_dismissed/.test(src)) offenders.push(f)
  }
  assert.deepEqual(
    offenders, [],
    'An agent saying "stop showing me this person" is a working preference, not the ' +
      'contact exercising a right. These files decide whether somebody may be MESSAGED ' +
      'and must read the consent ledger, the suppression list and the policy row — ' +
      'never a match outcome:\n\n' +
      offenders.map((f) => `  • ${f}`).join('\n') +
      '\n\nIf an agent dismissal should suppress somebody, that is an objection and it ' +
      'belongs in consent_events, recorded because a person asked for it.\n',
  )
})

test('the matching run does not consult the gate, the ledger or the suppression list', () => {
  const offenders: string[] = []
  for (const f of MATCHING_PATH) {
    const src = read(f)
    if (!src) continue
    // Comments explain the boundary at length in these files, so the check is
    // on CODE: an import, or a table named in a query.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (/from\s+'@\/lib\/gate|from\s+'@\/lib\/suppression|decideGate|consent_by_contact|consent_events|from\('sends'\)/.test(code)) {
      offenders.push(f)
    }
  }
  assert.deepEqual(
    offenders, [],
    'Who may be contacted is a question asked at SEND time. Asking it while matching ' +
      'builds a second, quieter gate out of a filter — and a lead would disappear from ' +
      "an agent's screen for a reason nobody reported:\n\n" +
      offenders.map((f) => `  • ${f}`).join('\n') + '\n',
  )
})

/**
 * The permitted direction, asserted so the boundary cannot be "fixed" into a
 * ban. A candidate-set query that could not see past dismissals would show the
 * agent the same person for every listing they ever reject.
 */
test('the boundary is not a ban: the matching side may read listing_matches', () => {
  const store = read('cockpit/src/lib/matching/run-store.ts')
  assert.ok(store, 'run-store.ts must exist for this direction to mean anything')
  assert.match(
    store,
    /listing_matches/,
    'the matching side is where listing_matches is read and written; if that stopped ' +
      'being true, this boundary is guarding a thing that no longer happens',
  )
})
