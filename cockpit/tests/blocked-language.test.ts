import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A GATE RECORDED ANYWHERE BUT THE LEDGER IS A GATE NOBODY WILL SEE OPEN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `gates.test.ts` is only load-bearing if it is the ONLY place that knows what
 * is blocked. The moment "waiting on Meta" is also written in a doc, in a
 * migration header and in a page's copy, opening the gate stops meaning
 * anything: the ledger fails, somebody clears it, and four other copies quietly
 * keep saying a thing that is no longer true. That is precisely the stale
 * record the ledger exists to prevent, arriving by the back door.
 *
 * 🔴 THE SWEEP THAT MADE THIS. Run on 20 September 2026 over the whole repo.
 * Three passes, each narrower than the last:
 *
 *   broad blocked-language     130 hits / 54 files   unusable
 *   verb + holder within 60ch  152 hits / 62 files   WORSE — "Meta" is a
 *                                                    legitimate domain noun on
 *                                                    every page that sends a
 *                                                    WhatsApp message
 *   the five forms below        12 hits / 10 files   enforceable
 *
 * The middle pass is the lesson and it is the detector-precision rule again:
 * broadening a detector to catch more made it catch less, because 152 hits is
 * a number you scroll past. A guard nobody can read is a guard nobody runs.
 *
 * WHAT THE GUARD DOES NOT CLAIM. These five forms are not all the ways English
 * can say that something is held. They are the forms that, in this repo, mean
 * it and almost nothing else. A new gate written in some other phrasing walks
 * straight past this test — which is why `gates.test.ts`, not this file, is the
 * thing that has to be kept true, and this is only the drift guard on it.
 */

const HOLDER = String.raw`(Meta|Margarida|the lawyer|a lawyer|uma advogada|ADENE|a first client|a real client|an agency)`
const DID = String.raw`(confirms?|confirmed|verifies|verified|answers?|answered|replies|replied|signs?|signed)`

/** The five forms. Exported so the control can drive the same reader. */
export const FORMS: { pattern: RegExp; form: string }[] = [
  { pattern: new RegExp(String.raw`\bblocked (?:on|by) [^.\n]{0,40}?` + HOLDER, 'i'), form: 'blocked on X' },
  { pattern: new RegExp(String.raw`\bwaiting (?:on|for) [^.\n]{0,40}?` + HOLDER, 'i'), form: 'waiting on X' },
  { pattern: new RegExp(String.raw`\bgated on [^.\n]{0,40}?` + HOLDER, 'i'), form: 'gated on X' },
  { pattern: new RegExp(String.raw`\buntil ` + HOLDER + String.raw`[^.\n]{0,40}?\b` + DID, 'i'), form: 'until X does Y' },
  { pattern: new RegExp(String.raw`\bonce ` + HOLDER + String.raw`[^.\n]{0,40}?\b` + DID, 'i'), form: 'once X does Y' },
]

export type Hit = { file: string; line: number; form: string; text: string }

export function sweep(root: string, skipFiles: Set<string>): Hit[] {
  const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '__pycache__', '.playwright-mcp', 'coverage'])
  const EXT = /\.(ts|tsx|md|sql|json|py|sh)$/
  const hits: Hit[] = []

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(p)
        continue
      }
      if (skipFiles.has(name) || !EXT.test(name)) continue
      let text: string
      try {
        text = readFileSync(p, 'utf-8')
      } catch {
        continue
      }
      text.split('\n').forEach((line, i) => {
        for (const { pattern, form } of FORMS) {
          if (pattern.test(line)) {
            hits.push({ file: relative(root, p).split(sep).join('/'), line: i + 1, form, text: line.trim().slice(0, 130) })
            return
          }
        }
      })
    }
  }
  walk(root)
  return hits
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RATCHET. Each line is a hit that existed on 20 September 2026, with the
 * reason it is still there.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔴 IT IS NOT AN EXEMPTION LIST. It is the sweep's result, written down so the
 * guard can be switched on today rather than after a rewrite. Two kinds of
 * entry, and telling them apart is the whole value of having done the sweep by
 * hand rather than by count:
 *
 *   ABSORBED — the sentence is a gate record, and `gates.ts` now holds it. The
 *   copy that remains is either history (a design doc written before the
 *   ledger, which should not be edited to pretend otherwise) or prose that
 *   should point at the entry rather than restate it.
 *
 *   NOT A GATE RECORD — the sentence describes a MECHANISM, or DENIES that
 *   something is blocked. "A row is inert until a lawyer confirms it" is the
 *   definition of the inert state. "Nothing is waiting on Meta" is the screen
 *   correctly saying the opposite of blocked. Moving either into the ledger
 *   would make the ledger wrong.
 *
 * Shrinking it is good. Growing it needs a reason written on the line.
 */
const CARRIED: Record<string, string> = {
  // ── absorbed: the ledger now holds these, keyed by the entry that does ────
  // docs/WHERE-WE-LEFT-OFF.md was carried on 20 Sep and cleared the same day:
  // the handover is a LIVING document, so "gated on Meta" became a pointer at
  // gates.ts review-asks. 12 → 11. The design docs below are history and stay.
  'docs/cockpit-design-brief-client-2.md': 'absorbed by gates.ts (meta_verified, enquadramento, certificate-lookup) — a design doc written before the ledger existed; history, not a second record',
  'docs/cockpit-mindmap.md': 'absorbed by gates.ts campaign-send-path — the mindmap is the record of what was thought when, and is not rewritten',
  'docs/cockpit-design-brief.md': 'absorbed by gates.ts template-submission — S5 examples in §2.x, describing what a SCREEN renders when a gate is shut',
  'docs/cockpit-build-plan.md': 'absorbed by gates.ts pt-publication-gate — describes the S5 state of the policy screen, not a new gate',

  // ── not a gate record: mechanism, or a denial ────────────────────────────
  'cockpit/src/app/c/[client]/templates/page.tsx': 'NOT A GATE RECORD — "Nothing is waiting on Meta" is the screen DENYING that anything is held. The ledger must never absorb a denial',
  'cockpit/src/app/today/page.tsx': 'NOT A GATE RECORD — group 5 notBuilt copy, naming the waiting room as a thing not yet built',
  'cockpit/src/lib/segmentation/copy.ts': 'NOT A GATE RECORD — explains the DISTINCTION between a country analysed-and-waiting and one never analysed. The Spain fix is in this sentence',
  'cockpit/tests/segmentation.test.ts': 'NOT A GATE RECORD — asserts that distinction, quoting it',
  'db/migrations/0029_advertising_policy.sql': 'NOT A GATE RECORD — "a row is INERT until a lawyer confirms it" defines the inert state. It is the mechanism, not a wait',
}

const REPO = join(import.meta.dirname, '..', '..')

test('🔴 nothing new says something is blocked outside the ledger', () => {
  const hits = sweep(REPO, new Set(['gates.ts', 'gates.test.ts', 'blocked-language.test.ts']))
  const fresh = hits.filter((h) => !(h.file in CARRIED))
  if (fresh.length === 0) return

  const lines = [
    '',
    '  ═══════════════════════════════════════════════════════════════════',
    `  ${fresh.length} PLACE(S) RECORD A GATE OUTSIDE gates.ts.`,
    '  ═══════════════════════════════════════════════════════════════════',
    '',
  ]
  for (const h of fresh) {
    lines.push(`  ${h.file}:${h.line}  [${h.form}]`)
    lines.push(`      ${h.text}`)
    lines.push('')
  }
  lines.push('  🔴 THIS BELONGS IN cockpit/src/lib/gates.ts.')
  lines.push('')
  lines.push('  Add a BLOCKED entry naming the gate, what is held, where it lives,')
  lines.push('  what to do when it opens and what to re-read — then say it HERE in')
  lines.push('  one clause that points at the entry, rather than restating it.')
  lines.push('')
  lines.push('  If it is not a gate record — if it describes a mechanism, or denies')
  lines.push('  that anything is waiting — add the file to CARRIED with that reason.')
  lines.push('  Both kinds are already in there; copy the closest one.')
  lines.push('')
  assert.fail(lines.join('\n'))
})

test('the ratchet only tightens: every carried file still exists and still hits', () => {
  /*
   * Without this, the list becomes permanent scaffolding. A file that was
   * renamed, or whose sentence was rewritten, leaves an entry that silently
   * exempts a path — and the next real gate written there is invisible.
   */
  const hits = sweep(REPO, new Set(['gates.ts', 'gates.test.ts', 'blocked-language.test.ts']))
  const hitFiles = new Set(hits.map((h) => h.file))
  const stale = Object.keys(CARRIED).filter((f) => !hitFiles.has(f))
  assert.deepEqual(
    stale,
    [],
    `carried files that no longer contain blocked language — delete these lines, the ratchet has tightened:\n    ${stale.join('\n    ')}`,
  )
  console.log(`\n  ${hits.length} carried hits across ${hitFiles.size} files; 0 outside the ratchet.\n`)
})

test('every carried line says WHY, and names the entry or denies being one', () => {
  for (const [file, reason] of Object.entries(CARRIED)) {
    assert.ok(reason.length > 30, `${file}: the reason is too short to be one`)
    assert.ok(
      /gates\.ts|NOT A GATE RECORD/.test(reason),
      `${file}: a carried line must name the gates.ts entry that absorbs it, or say NOT A GATE RECORD and why`,
    )
  }
})

// ── the control ─────────────────────────────────────────────────────────────

test('the control: the detector fires on each of the five forms', () => {
  /*
   * 🔴 A sweep that returns nothing and a reader that sees nothing are the
   * same output. This drives all five patterns over a sentence each — written
   * here, never anywhere the guard walks.
   */
  const samples: [string, string][] = [
    ['blocked on X', 'The send path is blocked on Meta verifying the number.'],
    ['waiting on X', 'It is waiting on the lawyer before anything can be advertised.'],
    ['gated on X', 'Automation 05 is gated on Meta, the same gate as 02.'],
    ['until X does Y', 'The row stays inert until a lawyer confirms the policy.'],
    ['once X does Y', 'It becomes possible once Meta verified the business account.'],
  ]
  for (const [form, text] of samples) {
    const f = FORMS.find((x) => x.form === form)
    assert.ok(f, `no pattern named ${form}`)
    assert.ok(f.pattern.test(text), `the ${form} pattern does not fire on its own example: ${text}`)
  }

  // And it is not a detector that fires on everything: ordinary prose about
  // these same nouns must stay silent, or the guard would be noise.
  const quiet = [
    'The template is submitted to Meta through the Business Manager.',
    'A lawyer reviewed the wording in March and it has not changed.',
    'Waiting rooms are a pattern, not a table.',
  ]
  for (const text of quiet) {
    for (const { pattern, form } of FORMS) {
      assert.ok(!pattern.test(text), `the ${form} pattern is too broad — it fires on: ${text}`)
    }
  }
})
