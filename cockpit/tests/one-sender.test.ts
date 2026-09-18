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
 * The one file allowed to hold the READ credential. It exists.
 *
 * Two credentials now, and therefore TWO assertions rather than one weakened
 * into "at most two files hold a Twilio credential". The sending credential may
 * appear in exactly one file and it is not the reader; the read credential may
 * appear in exactly one file and it is not the dispatcher. Weakening them into
 * a single count would let both live in the same file and still pass.
 */
const READER = 'cockpit/src/lib/send/provider-reader.ts'

/**
 * The dry run reports which key is configured, masked, so it names the READ
 * credential. A true positive, exempted explicitly rather than by widening the
 * rule — an exception that exists on purpose can be re-examined, one that
 * exists by oversight cannot (§4d).
 *
 * It is exempted for the READ credential ONLY. If it ever names the sending
 * credential the assertion above fires, and it should.
 */
const READ_CRED_ALSO_ALLOWED = ['cockpit/tests/probe-reconcile.ts']

/**
 * The adapter's own test sets placeholder credentials so the request builder can
 * be exercised. It names the SENDING credential, which is a true positive under
 * the rule that a file naming a credential can reach it — in CI with real
 * values present, `||=` would use the real ones.
 *
 * Exempted explicitly and narrowly, with a compensating assertion below: that
 * file must ALWAYS inject `fetchImpl`, so even holding a real credential it
 * cannot reach the network. The exemption is for naming, never for sending.
 */
/**
 * Each entry is exempted for NAMING the sending credential, and each carries its
 * own compensating check below — a different one, because they are safe for
 * different reasons. A single shared loosening would be the moment "at most one"
 * started drifting towards "some".
 */
const SEND_CRED_ALSO_ALLOWED: Record<string, 'injects-fetch' | 'no-route-to-a-sender'> = {
  // Builds requests to assert their shape. Safe because every construction
  // injects fetch, so a real credential in the environment changes nothing.
  'cockpit/tests/twilio-adapter.test.ts': 'injects-fetch',
  // Reports whether the credential is configured, as one of the blockers a dry
  // run lists. Safe because it imports campaign-plan and nothing else — there
  // is no adapter, dispatcher or permit within its reach.
  'cockpit/tests/probe-campaign.ts': 'no-route-to-a-sender',
}

/**
 * Credentials are matched by NAME, anywhere in the file, not by access pattern.
 *
 * The first version matched `process.env.TWILIO_…`, and provider-reader.ts
 * defeated it by accident on the first run: it reads `process.env[name]` through
 * a helper, so the credential names appear only as string literals and the scan
 * saw nothing. The same indirection in a SENDING file would have hidden a
 * sender — one `process.env[k]` and the boundary check goes quiet.
 *
 * So the question is not "does this file access the environment in the shape I
 * expected", it is "does this file name the credential at all". A file that
 * names it can reach it.
 */
/** Sending. A Restricted key with Create, or the account auth token. */
const SEND_CRED = /\b(TWILIO_AUTH_TOKEN|TWILIO_API_SECRET|TWILIO_SEND_KEY_[A-Z_]+|WHATSAPP_TOKEN|MESSAGING_[A-Z_]+)\b/
/** Reading. Restricted to Messaging → messages → Read and List. */
const READ_CRED = /\bTWILIO_READ_KEY_[A-Z_]+\b/

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
    'cockpit/src/lib/send/provider-reader.ts',
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

test('the SENDING credential appears in at most one file, and it is not the reader', () => {
  // The real boundary: without a credential that can create, a file CANNOT
  // send, whatever it imports.
  const offenders = FILES.filter((f) => SEND_CRED.test(f.text)).map((f) => f.path)
  assert.deepEqual(
    offenders.filter((p) => p !== SENDER && !(p in SEND_CRED_ALSO_ALLOWED)), [],
    'the sending credential may only appear in the adapter. Offending file(s) above.\n' +
    'A file that can construct a sending client can send without a send row.',
  )
})

test('every file exempted for the sending credential carries its own compensation', () => {
  // The exemption is for NAMING, never for SENDING, and this is what makes that
  // a fact rather than an intention.
  for (const [exempt, how] of Object.entries(SEND_CRED_ALSO_ALLOWED)) {
    const f = FILES.find((x) => x.path === exempt)
    assert.ok(f, `${exempt} is exempted and does not exist — remove the exemption`)

    if (how === 'injects-fetch') {
      const constructions = [...f!.text.matchAll(/twilioAdapter\(/g)].length
      const injected = [...f!.text.matchAll(/twilioAdapter\(\{[^)]*fetchImpl/gs)].length
      assert.ok(constructions > 0, `${exempt} claims 'injects-fetch' and never builds an adapter`)
      assert.equal(injected, constructions,
        `${exempt} builds the adapter ${constructions} time(s) and injects fetch ${injected} time(s) — ` +
        'an un-injected construction could reach Twilio with a real credential')
    }

    if (how === 'no-route-to-a-sender') {
      for (const forbidden of [/twilioAdapter/, /send\/dispatch/, /send\/permit/, /SendPermit/]) {
        assert.equal(forbidden.test(f!.text), false,
          `${exempt} claims 'no-route-to-a-sender' and references ${forbidden}`)
      }
    }
  }
})

test('the sender exists now, and the assertions above are about a file rather than an absence', () => {
  // Every check in this file passed for weeks while `twilio-adapter.ts` did not
  // exist — "at most one" is satisfied by zero. This asserts the slot is filled,
  // so the suite is now testing a real boundary rather than an empty one (§5c).
  const sender = FILES.find((f) => f.path === SENDER)
  assert.ok(sender, `${SENDER} does not exist — the credential assertions are vacuous without it`)
  assert.equal(SEND_CRED.test(sender!.text), true, 'the sender does not hold the sending credential')
  assert.equal(READ_CRED.test(sender!.text), false, 'the sender holds the READ credential too')
})

test('the READ credential appears in at most one file, and it is not the dispatcher', () => {
  // The mirror. Without it, both credentials could migrate into one file and a
  // single "at most two files" assertion would still pass.
  const offenders = FILES.filter((f) => READ_CRED.test(f.text)).map((f) => f.path)
  assert.deepEqual(
    offenders.filter((p) => p !== READER && !READ_CRED_ALSO_ALLOWED.includes(p)), [],
    'the read credential may only appear in provider-reader.ts (and the named dry run). ' +
    'Offending file(s) above.',
  )
  // The exemption is for reading only, and this is what keeps it narrow.
  for (const exempt of READ_CRED_ALSO_ALLOWED) {
    const f = FILES.find((x) => x.path === exempt)
    if (!f) continue
    assert.equal(SEND_CRED.test(f.text), false,
      `${exempt} is exempted for the READ credential and names a SENDING one`)
  }
  assert.ok(
    FILES.some((f) => f.path === READER && READ_CRED.test(f.text)),
    'the reader does not hold the read credential — has it been moved, or renamed?',
  )
})

test('the two credentials never meet: neither file holds the other one', () => {
  // The property that makes the split worth having. If the reader ever holds a
  // sending credential, the boundary is gone however tidy the file count looks.
  const reader = FILES.find((f) => f.path === READER)
  assert.ok(reader, `${READER} was not found`)
  assert.equal(SEND_CRED.test(reader!.text), false,
    'the reader holds a SENDING credential — it could then cause a message to exist')

  const dispatcher = FILES.find((f) => f.path === 'cockpit/src/lib/send/dispatch.ts')
  assert.equal(READ_CRED.test(dispatcher!.text), false,
    'the dispatcher holds the READ credential — the two roles have merged')
})

test('the reader is structurally incapable of sending, not merely not calling send', () => {
  const src = codeOnly(readFileSync(join(REPO, READER), 'utf8'))

  // 1. No SDK: there is no `client.messages.create` in scope to reach for.
  assert.equal(/from ['"]twilio['"]|require\(\s*['"]twilio['"]/.test(src), false,
    'the reader imports the Twilio SDK — create() is then one edit away from being called')

  // 2. One route to the network, and it hardcodes GET.
  const fetches = [...src.matchAll(/\bfetch\(/g)].length
  assert.equal(fetches, 1, `the reader makes ${fetches} fetch calls — there must be exactly one, inside getJson`)
  assert.match(src, /method: 'GET'/)

  // 3. No write verb, and no request body on the one call.
  // NOT a bare /body:/ — that matched `body: string` in the message TYPE on the
  // first run. A check that fires on a field name is measuring the wrong thing,
  // and would have been silenced by renaming rather than by fixing anything.
  for (const forbidden of [
    /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
    /\.create\(/,
    /fetch\([^)]*body:/s,
  ]) {
    assert.equal(forbidden.test(src), false,
      `the reader contains ${forbidden} — adding a write here must be a visible act, not an argument change`)
  }
})

test('only the sender and the reader reach the provider API by URL', () => {
  // Closes the loophole of skipping the SDK and using fetch() directly. TWO
  // files may now, and which one may do WHAT is the subject of the credential
  // assertions above — the reader reaching api.twilio.com with a key that
  // cannot create is not a hole.
  const URL_RE = /https?:\/\/[a-z0-9.-]*twilio\.com/i
  const offenders = FILES.filter((f) => URL_RE.test(f.text)).map((f) => f.path)
  assert.deepEqual(
    offenders.filter((p) => p !== SENDER && p !== READER), [],
    'the provider API may only be called from the adapter or the reader. Offending file(s) above.',
  )
})

test('the template module is not a route to sending', () => {
  // The obvious reading of "nothing here may become a route to sending" is
  // about calls, and this is that half. The other half is a COLUMN, and it is
  // guarded in 0020's header: default_recipients, auto_send_on_approval,
  // send_to_segment — each turns a record of what was approved into a campaign
  // definition, and something will eventually read it and act.
  const src = codeOnly(readFileSync(join(REPO, 'cockpit/src/lib/send/template.ts'), 'utf8'))
  for (const forbidden of [
    /from '@\/lib\/send\/dispatch'/, /from '@\/lib\/send\/permit'/,
    /SendPermit/, /dispatch\(/,
  ]) {
    assert.equal(forbidden.test(src), false,
      `template.ts references ${forbidden} — it records what may be said and must have no route to a send`)
  }
  // render() returns a string. If it ever returned something permit-shaped, a
  // caller holding a rendered body would hold half a send.
  assert.match(src, /export function render\(body: string, variables: string\[\]\): string/)
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

test('the campaign PLANNER has no route to a send, so a dry run cannot become a live one', () => {
  // planCampaign reads production and is called by probe:campaign. It is a
  // separate file from the port assembly precisely so that "plan it and look"
  // cannot become "plan it and go" by an edit to one line.
  const src = codeOnly(readFileSync(join(REPO, 'cockpit/src/lib/send/campaign-plan.ts'), 'utf8'))
  for (const forbidden of [
    /twilioAdapter/, /from '@\/lib\/send\/dispatch'/, /from '@\/lib\/send\/permit'/,
    /SendPermit/, /\.insert\(/, /\.update\(/, /\.delete\(/,
  ]) {
    assert.equal(forbidden.test(src), false,
      `campaign-plan.ts references ${forbidden} — planning is read-only and has no route to a send`)
  }
})
