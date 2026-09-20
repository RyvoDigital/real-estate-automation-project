import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A GREYED CONTROL IS NOT A REFUSAL — SO THERE IS NO CONTROL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The operator's rule, 20 September 2026, now §0.4-7 and applying to every
 * screen rather than only to settings:
 *
 *   a disabled control still reads as ONE CLICK FROM GOING. The reader's
 *   question is "why can't I press this", and the honest answer to "this can
 *   never be pressed" is that the control does not exist.
 *
 * Settings is where it bites hardest, because three things there genuinely
 * cannot change — the WhatsApp number, the sender SID — and a form is exactly
 * where a disabled input feels natural to write.
 *
 * 🔒 REPO-WIDE, not settings-only. The rule is general, and a check scoped to
 * the screen that prompted it would let the next screen reintroduce it.
 */

const SRC = join(import.meta.dirname, '..', 'src')
const REPO = join(import.meta.dirname, '..', '..')

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 THE DISTINCTION, WITHOUT WHICH THIS CHECK IS UNUSABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first version of this test banned `disabled` outright and found SEVENTEEN
 * hits, of which about two were real. That is §1o exactly — a detector
 * broadened to catch more catches less, because seventeen hits is a number
 * somebody mutes.
 *
 * The rule is about WHY a control cannot be pressed, and there are two answers:
 *
 *   PERMANENT   "this can never be pressed." The reader's question is "why
 *               can't I?", and the honest answer is that the control should not
 *               exist. This is what §0.4-7 forbids.
 *
 *   IN FLIGHT   "this is already going." Temporary, self-resolving, and the
 *               honest way to stop a double submit. The reader's question does
 *               not arise, because the button was pressable a moment ago and
 *               will be again. Forbidding this would make every form in the
 *               cockpit submit twice.
 *
 * So the check is on what the attribute is BOUND TO, not on the attribute.
 */

/** In JSX, and never a prose mention or an object key like `disabled: 'held'`. */
const ATTRIBUTE = /(?:^|\s)(disabled|readOnly|aria-disabled)=(\{[^}]*\}|"[^"]*"|'[^']*')/

/**
 * The in-flight expressions this repo actually uses. NAMED, not pattern-matched
 * on "looks transient" — a binding nobody has thought about must fall through
 * to the strict side, which is the safe direction.
 */
const IN_FLIGHT = /\b(pending|isPending|submitting|isSubmitting|busy|loading)\b/

function offendingAttribute(line: string): string | null {
  const m = ATTRIBUTE.exec(line)
  if (!m) return null
  const bound = m[2]
  if (IN_FLIGHT.test(bound)) return null
  // `disabled` with no value at all is the bare JSX form, always permanent.
  return `${m[1]}=${bound}`
}

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.tsx$/.test(p)) out.push(p)
  }
  return out
}

test('🔴 no rendered control is disabled, readonly or aria-disabled', () => {
  const problems: string[] = []

  for (const p of files(SRC)) {
    /*
     * 🔒 Comments stripped. The rule's own explanation has to use the words —
     * this file does, `frame.ts` does, the settings page does — and a detector
     * that fired on the sentence forbidding a thing is the mistake this repo
     * has now made three times and written a lesson about (§1o, §0.4-9).
     */
    const src = readFileSync(p, 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    src.split('\n').forEach((line, i) => {
      const bad = offendingAttribute(line)
      if (bad) {
        problems.push(`${relative(REPO, p).split(sep).join('/')}:${i + 1}  ${bad}  —  ${line.trim().slice(0, 80)}`)
      }
    })
  }

  assert.deepEqual(
    problems,
    [],
    `\n\n  🔴 ${problems.length} disabled or readonly control(s).\n\n` +
      problems.map((x) => `    ${x}`).join('\n') +
      '\n\n  A greyed control still reads as one click from going. If it can\n' +
      '  NEVER be pressed, render the value as text with the reason beside it —\n' +
      '  settings/page.tsx does this for the WhatsApp number and the SID.\n\n' +
      '  If it is disabled only while a submit is in flight, bind it to one of:\n' +
      '  pending, isPending, submitting, isSubmitting, busy, loading. That is a\n' +
      '  different claim and this check allows it.\n',
  )
})

test('🔴 the control: it fires on a permanent disable and NOT on an in-flight one', () => {
  /*
   * Both halves matter. A detector that missed the permanent case would be
   * decorative; one that fired on the in-flight case would be muted within a
   * week, and a muted detector reads as coverage (§3.23).
   */
  assert.ok(offendingAttribute('<button disabled={true}>'), 'a permanently disabled button was not caught')
  assert.ok(offendingAttribute('<input readOnly={someCondition} />'))
  assert.ok(offendingAttribute('<div aria-disabled="true">'))
  assert.ok(offendingAttribute('<button disabled={!canEverPress}>'))

  assert.equal(offendingAttribute('<button type="submit" disabled={pending}>'), null, 'an in-flight disable was flagged')
  assert.equal(offendingAttribute('<button disabled={pending || accepted === 0}>'), null)
  assert.equal(offendingAttribute('<button disabled={isSubmitting}>'), null)

  // And not on prose, nor on an object key that happens to be called disabled.
  assert.equal(offendingAttribute('const enabled = row.enabled'), null)
  assert.equal(offendingAttribute("  disabled: 'held',"), null, 'an object key is not a control')
  assert.equal(offendingAttribute('a disabled control is not a refusal'), null)
})

test('settings renders the frozen fields as text, and says why each is frozen', () => {
  const page = readFileSync(
    join(SRC, 'app', 'c', '[client]', 'settings', 'page.tsx'),
    'utf-8',
  )
  // The positive half: it is not enough to have no disabled input if the
  // value simply vanished.
  assert.match(page, /styles\.frozen/, 'the frozen value is not rendered')
  assert.match(page, /f\.why/, 'a frozen field must carry the reason it cannot change')
  assert.ok(!/<input/.test(page), 'settings has acquired an input; the frozen fields must stay text')
})
