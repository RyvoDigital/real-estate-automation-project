/*
 * ONE FILE MAY SEND. THIS IS THE FILE THAT CHECKS IT.
 *
 * Of the three mechanisms defending the send path — a private constructor that
 * makes the wrong order fail to compile, a dispatcher that re-reads the row so
 * a forged permit fails at runtime, and this — this one looks the weakest and
 * is the most valuable. The other two require knowing the argument. This one
 * fails with a filename, so a person who has never read the design still cannot
 * add a second sender without being told.
 *
 * engineering-lessons §12: prefer a boundary to a rule. A rule is advice and no
 * obstacle to the obvious next step; a test that names the offending file is an
 * obstacle.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const REPO = new URL('../../', import.meta.url).pathname
const SELF = 'cockpit/tests/one-sender.test.ts'

/**
 * The one file allowed to touch the provider. It does not exist yet, and that
 * is the correct state: nothing can physically send. The checks below assert
 * "at MOST one, and if it exists it is this" — they pass today with zero, and
 * the day somebody writes a sender anywhere else they fail with its name.
 *
 * NOT dispatch.ts: that file owns no IO and no credentials by design, which is
 * what makes the retry rules testable. The credential lives in the adapter.
 */
const SENDER = 'cockpit/src/lib/send/twilio-adapter.ts'

/**
 * THE SCAN COVERS THE WHOLE REPOSITORY, NOT JUST cockpit/src.
 *
 * The first version scanned `cockpit/src` alone, which meant a sender added to
 * the n8n shared modules in `src/`, to a script in `infra/`, or to a test could
 * not be seen. The assertions read as "no other file may send" and meant "no
 * other file UNDER cockpit/src may send" — weaker than they looked, and weakest
 * exactly where it matters: the gate decision says n8n never sends marketing,
 * so an n8n module is the one place a bypass would be both plausible and
 * catastrophic.
 *
 * THE ONE EXCEPTION, STATED RATHER THAN HIDDEN: `workflows/` legitimately calls
 * the provider ~35 times. The Concierge REPLIES inside the 24-hour window the
 * lead opened, which is not a business-initiated message and needs no gate.
 * That is the boundary this file defends — business-initiated sends — and the
 * exception is excluded by path so that removing it is a visible edit.
 */
const SKIP = /(^|\/)(node_modules|\.next|\.git|dist|build|workflows)(\/|$)/

function sources(dir = REPO, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (SKIP.test(relative(REPO, p))) continue
    if (statSync(p).isDirectory()) sources(p, acc)
    else if (/\.(ts|tsx|js|mjs|py|sh)$/.test(name)) acc.push(p)
  }
  return acc
}

/**
 * Comment lines dropped, code kept.
 *
 * Line-based rather than a regex over the whole file, deliberately: stripping
 * `//` to end-of-line would mangle a URL inside a string literal
 * ('https://api.twilio.com') and silently break the very check that looks for
 * it. This misses a block comment whose lines do not begin with `*`, which is
 * a real limitation and an acceptable one — the checks below look for imports
 * and credentials, neither of which hides in prose.
 */
function codeOnly(text: string): string {
  return text
    .split('\n')
    .filter((l) => {
      const s = l.trimStart()
      return !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*') && !s.startsWith('#')
    })
    .join('\n')
}

const FILES = sources()
  .map((p) => ({ path: relative(REPO, p), text: codeOnly(readFileSync(p, 'utf8')) }))
  // This file names the provider in order to look for it.
  .filter((f) => f.path !== SELF)

test('the scan sees both worlds (a vacuous pass proves nothing, §5c)', () => {
  // Positive controls, one per root. A count alone would stay green if an
  // entire tree stopped being visited, which is exactly the blind spot this
  // check exists to catch — and did catch, in its first version.
  assert.ok(FILES.length > 80, `only ${FILES.length} files found — the scan is broken`)
  for (const control of [
    'cockpit/src/lib/send/dispatch.ts',   // the cockpit
    'src/invariants.js',                  // the n8n shared modules
    'cockpit/src/lib/gate.ts',
    'tests/opt_out.test.js',
  ]) {
    assert.ok(FILES.some((f) => f.path === control), `${control} was not visited — the scan has a blind spot`)
  }
  // And the sender is ALLOWED not to exist. Asserting its presence is what the
  // first version did, and it made a missing file look like a broken scanner.
})

test('the provider SDK is imported in at most one file, and it is the dispatcher', () => {
  // Matches an import of the SDK by name, however it is written.
  const SDK = /\b(from\s+['"]twilio['"]|require\(\s*['"]twilio['"]\s*\)|from\s+['"]@twilio\/)/
  const offenders = FILES.filter((f) => SDK.test(f.text)).map((f) => f.path)
  assert.deepEqual(
    offenders.filter((p) => p !== SENDER), [],
    'the provider SDK may only be imported by the dispatcher. Offending file(s) above.\n' +
    'If this is a new send path, it must go through dispatch() — see docs/send-path-design.md §2.',
  )
})

test('provider credentials are read in at most one file, and it is the dispatcher', () => {
  // The real boundary: without the credential in scope, a file CANNOT send,
  // whatever it imports.
  const CRED = /process\.env\.(TWILIO_[A-Z_]+|WHATSAPP_[A-Z_]+|MESSAGING_[A-Z_]+)/
  const offenders = FILES.filter((f) => CRED.test(f.text)).map((f) => f.path)
  assert.deepEqual(
    offenders.filter((p) => p !== SENDER), [],
    'provider credentials may only be read by the dispatcher. Offending file(s) above.\n' +
    'A file that can construct a provider client can send without a send row.',
  )
})

test('nothing but the dispatcher calls the provider REST API by URL', () => {
  // Closes the loophole of skipping the SDK and using fetch() directly.
  const URL_RE = /https?:\/\/[a-z0-9.-]*twilio\.com/i
  const offenders = FILES.filter((f) => URL_RE.test(f.text)).map((f) => f.path)
  assert.deepEqual(
    offenders.filter((p) => p !== SENDER), [],
    'the provider API may only be called from the dispatcher, by SDK or by URL.',
  )
})

test('SendPermit has no public constructor, so the wrong order cannot be written', () => {
  const src = readFileSync(join(REPO, 'cockpit/src/lib/send/permit.ts'), 'utf8')
  assert.match(src, /private constructor\(/,
    'SendPermit must keep its private constructor: it is what makes the insert produce the ' +
    'argument the send requires, rather than merely precede it')
  // And `record` must be the only factory. Counted over CODE, not prose: the
  // header above it says `new SendPermit(...)` is a compile error elsewhere,
  // and the first version of this test counted that sentence as a second
  // construction. A test that reads comments is measuring the wrong artefact.
  const factories = [...codeOnly(src).matchAll(/new SendPermit\(/g)].length
  assert.equal(
    factories, 1,
    `SendPermit is constructed ${factories} times in code — there must be exactly one factory, ` +
    'or the private constructor stops being the only way in',
  )
})

test('the dispatcher re-reads the row rather than trusting the permit', () => {
  const src = readFileSync(join(REPO, 'cockpit/src/lib/send/dispatch.ts'), 'utf8')
  for (const check of [
    /store\.read\(permit\.sendId\)/,
    /status !== 'intended'/,
    /idempotency_key !== permit\.idempotencyKey/,
    /gate_verdict !== 'permitted'/,
  ]) {
    assert.match(src, check,
      'dispatch() must re-read and re-check the row. A cast can forge a permit; it cannot forge a row.')
  }
})
