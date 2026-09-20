import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * NO GUARD IS SWITCHED OFF, AND NO SABOTAGE IS LEFT BEHIND.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 THE SABOTAGE CYCLE HAS TWO OBLIGATIONS AND ONLY ONE WAS EVER WRITTEN
 * DOWN. CLAUDE.md says: *"sabotage a guard and confirm the expected test goes
 * red — and assert the sabotage actually applied before believing the result."*
 *
 * It says nothing about the revert.
 *
 * That asymmetry is the whole risk. The sabotage half is verified because its
 * result is what you are waiting for; the revert half is verified only by
 * habit, at the moment attention has already moved to the next thing. And a
 * sabotage left in is uniquely bad:
 *
 *   · it is INDISTINGUISHABLE from an ordinary bug once it is in history;
 *   · the suite can stay GREEN, because a sabotage usually disables a guard
 *     and the thing that would complain is the guard;
 *   · so the only signal that anything is wrong is the one just removed.
 *
 * 🔒 This is the structural half. It cannot detect every possible sabotage —
 * nothing can, since a sabotage is just a wrong line — but it catches the two
 * shapes that actually occur: a marker comment left in, and a test switched
 * off. A rule in a lesson nobody re-reads mid-sabotage is not a mechanism.
 */

const ROOT = join(import.meta.dirname, '..')
const REPO = join(ROOT, '..')
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])

function walk(dir: string, match: RegExp): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, match))
    else if (match.test(p)) out.push(p)
  }
  return out
}

test('🔴 no sabotage marker is left in the source', () => {
  /*
   * The marker this repo actually uses when sabotaging, in caps, as a comment.
   * It is deliberately a word nobody writes by accident — which is what makes
   * it findable, and why the convention is to write it rather than to make a
   * silent edit.
   */
  const files = walk(join(ROOT, 'src'), /\.(ts|tsx|css)$/)
  const left = files
    .map((p) => ({ p, hit: /\bSABOTAGE\b/.exec(readFileSync(p, 'utf-8')) }))
    .filter((x) => x.hit)
    .map((x) => `${relative(REPO, x.p).split(sep).join('/')}  ${x.hit![0]}`)

  assert.deepEqual(
    left,
    [],
    `\n\n  🔴 A SABOTAGE MARKER IS STILL IN THE SOURCE.\n\n` +
      left.map((l) => `    ${l}`).join('\n') +
      '\n\n  Revert it. A sabotage left in is indistinguishable from an ordinary\n' +
      '  bug once committed, and the suite can stay green because the thing\n' +
      '  that would complain is the guard the sabotage disabled.\n',
  )
})

test('🔴 no test is skipped, and none is the only one running', () => {
  /*
   * The second shape. `.only` is worse than `.skip`: it silently stops every
   * OTHER test in the file, so the run is green and almost nothing ran.
   */
  const files = walk(join(ROOT, 'tests'), /\.test\.ts$/)
  const problems: string[] = []
  for (const p of files) {
    /*
     * 🔴 STRING LITERALS STRIPPED TOO, not just comments.
     *
     * The first run of this test failed on its OWN CONTROL, which asserts the
     * detector fires by passing it the string "test.only('a', () => {})". That
     * is the fourth time today a check has matched the text describing it —
     * the colour guard on prose, the retired-phrase guard on its own
     * explanation, the disabled guard on the sentence forbidding it, and this.
     *
     * The rule has earned its own line: a detector must match CODE, and a
     * mention of code inside a quoted string is prose that happens to be
     * syntactically valid.
     */
    const src = readFileSync(p, 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    for (const m of src.matchAll(/\btest\.(skip|only|todo)\b|\bit\.(skip|only)\b/g)) {
      problems.push(`${relative(REPO, p).split(sep).join('/')}  ${m[0]}`)
    }
  }
  assert.deepEqual(
    problems,
    [],
    `\n\n  🔴 ${problems.length} suppressed test(s).\n\n` +
      problems.map((l) => `    ${l}`).join('\n') +
      '\n\n  `.only` is the dangerous one: the run stays green and almost\n' +
      '  nothing ran. A suppressed test reads as coverage (§3.23).\n',
  )
})

test('the control: both detectors fire on what they are for', () => {
  // Without this, "nothing found" and "the regex is wrong" are one green.
  assert.match('const x = 1 // SABOTAGE: inverted', /\bSABOTAGE\b/)
  assert.match("test.only('a', () => {})", /\btest\.(skip|only|todo)\b/)
  assert.match("test.skip('a', () => {})", /\btest\.(skip|only|todo)\b/)
  // And not on ordinary text, or the check would be unusable.
  assert.doesNotMatch("test('the sabotage went red', () => {})", /\btest\.(skip|only|todo)\b/)
  assert.doesNotMatch('const sabotaged = source.replace(a, b)', /\bSABOTAGE\b/)
})
