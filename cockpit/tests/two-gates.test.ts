import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/*
 * TWO GATES, TWO SUBJECTS, AND NEITHER STANDS IN FOR THE OTHER.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ The CONSENT gate asks about the RECIPIENT — may we message this person? │
 * │ from consent, jurisdiction and suppression.                             │
 * │                                                                         │
 * │ The PUBLICATION gate asks about the PROPERTY — may this be advertised   │
 * │ at all? from the energy certificate and the AMI licence (§8.A).         │
 * │                                                                         │
 * │ A message naming BOTH needs BOTH. Neither is evidence of the other.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * THE FAILURE THIS EXISTS FOR LOOKS CORRECT FROM EVERY ANGLE.
 *
 * A lead-facing message about a specific property that satisfies consent,
 * jurisdiction and suppression perfectly — and never asks whether the property
 * may lawfully be advertised. Every existing check passes. The send record is
 * impeccable. The invariants hold. The fine is €250–€3,741 and it lands on the
 * client.
 *
 * WHY THIS FILE IS WRITTEN BEFORE ANY OF AUTOMATION 04 EXISTS.
 *
 * Automation 03's F5 — the lead-facing send — is the path that needs both gates,
 * and F5 IS NOT BUILT. So today every assertion here passes because nothing on
 * the send path knows what a listing is. The cost of getting this right is zero
 * now and rises the moment somebody touches F5.
 *
 * It fails WITH A FILENAME the day a send-path file learns about a property
 * without learning about its clearance — which is the only version of this rule
 * that survives somebody who has never read
 * docs/automation-04-publication-gate-design.md.
 *
 * engineering-lessons §12: prefer a boundary to a rule. A rule is advice and no
 * obstacle to the obvious next step.
 */

const REPO = resolve(new URL('../..', import.meta.url).pathname)
const read = (rel: string): string | null => {
  const p = resolve(REPO, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}
/** Comments explain this boundary at length in these files. Check the CODE. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Everything that can decide, authorise or perform a business-initiated send. */
const SEND_PATH = [
  'cockpit/src/lib/gate.ts',
  'cockpit/src/lib/gate-read.ts',
  'cockpit/src/lib/jurisdiction.ts',
  'cockpit/src/lib/jurisdiction-policy.ts',
  'cockpit/src/lib/suppression.ts',
  'cockpit/src/lib/send/evaluate.ts',
  'cockpit/src/lib/send/permit.ts',
  'cockpit/src/lib/send/dispatch.ts',
  'cockpit/src/lib/send/runner.ts',
  'cockpit/src/lib/send/campaign-plan.ts',
  'cockpit/src/lib/send/campaign-run.ts',
  'cockpit/src/lib/send/template.ts',
  'cockpit/src/lib/send/twilio-adapter.ts',
]

/**
 * The one file that may decide whether a property can be advertised. It does
 * not exist yet, and that is the correct state — the checks below assert
 * "at MOST one, and if it exists it is this", exactly as one-sender.test.ts
 * does for the provider credential.
 */
const PUBLICATION_GATE = 'cockpit/src/lib/publication/gate.ts'

/** Anything that means "this message is about a specific property". */
const KNOWS_A_PROPERTY = /\blisting_?[iI]d\b|from\(['"]listings['"]\)|\benergy_class\b|\bami_licence\b|\bpublication_clearances\b/

/** Anything that means "and its clearance travelled with it". */
const KNOWS_THE_CLEARANCE = /PublicationClearance|publication\/gate|publicationGate|clearanceId|clearance_id/

// ---------------------------------------------------------------------------

test('the boundary check can see the path it is guarding', () => {
  // §5c in miniature: a boundary asserted over files that are not there passes
  // identically to one where nothing crosses it. A rename would otherwise turn
  // this test green by deleting its subject.
  for (const f of SEND_PATH) {
    const src = read(f)
    assert.ok(src !== null, `${f} is on the send path and does not exist — it moved, or this check is passing over nothing`)
    assert.ok(src.length > 400, `${f} is suspiciously small for a send-path file`)
  }
  assert.ok(SEND_PATH.length >= 10, 'too few files for this boundary to mean anything')
})

test('🔴 a send-path file that knows about a property knows about its clearance', () => {
  // THE TRIPWIRE. Today nothing on the send path mentions a listing, so this
  // passes over a set that is empty ON PURPOSE — and the moment F5 is built,
  // the file that learns what a listing is must also learn what cleared it.
  const offenders: string[] = []
  for (const f of SEND_PATH) {
    const src = code(read(f) ?? '')
    if (!KNOWS_A_PROPERTY.test(src)) continue
    if (KNOWS_THE_CLEARANCE.test(src)) continue
    offenders.push(f)
  }
  assert.deepEqual(
    offenders, [],
    'These files decide or perform a send AND name a property, without the clearance that says\n' +
    'the property may lawfully be advertised. Consent is not evidence of that — it is an answer\n' +
    'about a different subject. A message naming a person and a property needs BOTH gates:\n\n' +
    offenders.map((f) => `  • ${f}`).join('\n') +
    '\n\nSee docs/automation-04-publication-gate-design.md §2.\n',
  )
})

test('the publication gate is constructed in at most one place, and it is the gate', () => {
  // The clearance is a class with a private constructor, so this is the
  // source-level half of "only the gate can make one".
  const makers: string[] = []
  for (const f of [...SEND_PATH, PUBLICATION_GATE]) {
    const src = code(read(f) ?? '')
    if (/new PublicationClearance\b/.test(src)) makers.push(f)
  }
  assert.ok(makers.length <= 1, `PublicationClearance is constructed in ${makers.length} files: ${makers.join(', ')}`)
  if (makers.length === 1) {
    assert.equal(makers[0], PUBLICATION_GATE, 'only the publication gate may create a clearance')
  }
})

test('🔴 the consent gate never learns what a property is', () => {
  // §2.4, first forbidden shape: a publication check inside decideGate. It has
  // no listing and no business acquiring one — the moment it takes a listing
  // id, every consent decision starts depending on property data, and the two
  // questions are one question again.
  for (const f of ['cockpit/src/lib/gate.ts', 'cockpit/src/lib/gate-read.ts']) {
    const src = code(read(f) ?? '')
    assert.doesNotMatch(
      src, KNOWS_A_PROPERTY,
      `${f} answers "may we message this PERSON". A property fact in it means the two gates ` +
      'have been merged, and a caller can no longer tell which half refused.',
    )
  }
})

test('🔴 nothing on the send path can be told the answer instead of asking', () => {
  // §2.4, second and third forbidden shapes, named here so the reasonable
  // version is refused by a filename rather than by a code review:
  //
  //   a combined mayWeSendThis() — two questions about two different subjects
  //   collapsed into one boolean, and the caller cannot tell which half said no
  //
  //   an "already checked" flag — the 2am fallback, and the thing this whole
  //   mechanism exists to make unnecessary
  const FORBIDDEN = /\b(mayWeSendThis|canSendThis|sendAllowed|okToSend|isSendable|alreadyChecked|alreadyCleared|operatorApproved|skipGate|bypassGate|forceSend|overrideGate)\b/
  const offenders: string[] = []
  for (const f of SEND_PATH) {
    const m = code(read(f) ?? '').match(FORBIDDEN)
    if (m) offenders.push(`${f}: ${m[0]}`)
  }
  assert.deepEqual(
    offenders, [],
    'A gate that can be told its own answer is not a gate:\n\n' +
    offenders.map((f) => `  • ${f}`).join('\n') +
    '\n\nTwo questions about two different subjects do not collapse into one boolean, and\n' +
    '"somebody already checked" is the fallback the mechanism exists to make unnecessary.\n',
  )
})

test('the boundary is not guarding something that stopped happening', () => {
  // The positive half. When the publication gate exists it MUST read the facts
  // §8.A names — otherwise this file is a fence around an empty field, which
  // passes every check above perfectly.
  const src = read(PUBLICATION_GATE)
  if (src === null) {
    assert.ok(true, 'the publication gate does not exist yet — the checks above are "at most one"')
    return
  }
  assert.match(src, /energy/i, 'the publication gate must read the energy certificate')
  assert.match(src, /ami/i, 'and the AMI licence')
})

test('🔴 nothing reads the flat columns 0032 drops', () => {
  // 0028's columns were the right facts in the wrong home, and 0030's typed
  // facts replaced them. Once 0032 has run, a file still naming one of them
  // queries a column that does not exist — a runtime failure on a screen rather
  // than a compile error, because Supabase selects are strings.
  //
  // This is also what stops them being REINTRODUCED. The next person to want an
  // energy class on a listing will reach for a column, and the column is the
  // shape that cannot hold Spain's two ratings or an agency's several
  // registrations.
  const DROPPED = /\benergy_class\b|\benergy_certificate_number\b|\benergy_certificate_expires_at\b|\benergy_exemption\b|\bami_licence\b/

  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full); continue }
      if (!/\.tsx?$/.test(e.name)) continue
      // screen-copy.ts lists them as FORBIDDEN WORDS for the vocabulary guard —
      // naming them in order to refuse them is the opposite of reading them.
      if (full.endsWith('screen-copy.ts')) continue
      const src = readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      const m = src.match(DROPPED)
      if (m) offenders.push(`${relative(REPO, full)}: ${m[0]}`)
    }
  }
  walk(resolve(REPO, 'cockpit/src'))

  assert.deepEqual(
    offenders, [],
    'These read a column 0032 drops. The facts live in listing_facts and agency_facts (0030),\n' +
    'because a single column cannot hold Spain\'s two ratings or an agency\'s several regional\n' +
    'registrations:\n\n' + offenders.map((f) => `  • ${f}`).join('\n') + '\n',
  )
})
