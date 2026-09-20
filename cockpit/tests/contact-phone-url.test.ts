import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { contactHref, fromPathSegment, redactForLog, toPathSegment } from '../src/lib/contact/phone-url'

/*
 * Brief II §1.2's two constraints on `/c/<client>/contacts/<phone>`, both
 * mechanical. The first is a correctness bug that hides for months; the second
 * is a privacy leak that is invisible from the page itself.
 */

const N = '+351912345678'

test('🔴 the + survives the round trip, encoded rather than bare', () => {
  assert.equal(toPathSegment(N), '%2B351912345678')
  assert.ok(!toPathSegment(N).includes('+'), 'a bare + in a query string decodes to a space')

  const back = fromPathSegment(decodeURIComponent(toPathSegment(N)))
  assert.deepEqual(back, { ok: true, e164: N })
})

test('🔴 a + turned into a space is recovered, because that is how it actually breaks', () => {
  /*
   * The real failure mode: `+` is legal in a path and means SPACE in a query
   * string. A number that arrives as " 351912345678" is silently a different
   * number, and the lookup returns nothing — the screen answers Q14 with "no
   * record" about somebody who has one.
   */
  const mangled = ' 351912345678'
  const r = fromPathSegment(mangled)
  assert.ok(r.ok, 'a space-for-plus number was not recovered')
  assert.equal(r.e164, N)
})

test('a segment that arrives still encoded is handled, since the two look alike', () => {
  const r = fromPathSegment('%2B351912345678')
  assert.ok(r.ok && r.e164 === N)
})

test('🔴 an unparseable number is REFUSED, never repaired into a plausible one', () => {
  /*
   * The dangerous direction. A wrong guess looks exactly like a correct lookup
   * that found nothing, and on this screen "found nothing" is a legal answer.
   */
  for (const bad of ['', '   ', 'hello', '+', '12', 'null', '+00000']) {
    const r = fromPathSegment(bad)
    assert.equal(r.ok, false, `"${bad}" was accepted as a number`)
  }
  const empty = fromPathSegment('')
  assert.ok(!empty.ok && empty.reason === 'empty')
  const junk = fromPathSegment('hello')
  assert.ok(!junk.ok && junk.reason === 'unparseable')
})

test('🔴 two countries whose national formats collide stay two contacts', () => {
  /*
   * Why dropping the `+` "works" until it does not. Without a country code
   * these digits are ambiguous; with one they are two different people, and a
   * screen that had been correct for months would start showing one person's
   * consent ledger under the other's number.
   */
  const pt = '+351912345678'
  const es = '+34912345678'
  assert.notEqual(toPathSegment(pt), toPathSegment(es))
  const backPt = fromPathSegment(decodeURIComponent(toPathSegment(pt)))
  const backEs = fromPathSegment(decodeURIComponent(toPathSegment(es)))
  assert.ok(backPt.ok && backPt.e164 === pt)
  assert.ok(backEs.ok && backEs.e164 === es)

  // And the bare digits, with the + lost, do NOT round-trip to the Spanish one.
  const stripped = fromPathSegment('912345678')
  assert.ok(!stripped.ok || stripped.e164 !== es, 'a number without its country code resolved to a foreign contact')
})

test('the href is built in one place, and it is encoded', () => {
  assert.equal(contactHref('c-1', N), '/c/c-1/contacts/%2B351912345678')
})

// ── the leak, asserted rather than intended ─────────────────────────────────

test('redactForLog keeps enough to recognise, not enough to be the contact', () => {
  const r = redactForLog(N)
  assert.match(r, /^\+351/, 'the country code is useful and not identifying on its own')
  assert.match(r, /78$/, 'the last two digits let an operator match a line to a person they are looking at')
  assert.ok(!r.includes('9123456'), 'the body of the number survived redaction')
  assert.equal(redactForLog('nonsense'), '•••', 'anything unparseable redacts to nothing at all')
})

test('🔴 no contact module sends a raw number anywhere outbound', () => {
  /*
   * §1.2: the number is acceptable on a page the operator is already reading,
   * and is personal data the moment it reaches a log, an error report, an
   * analytics call or a pasted URL.
   *
   * This is the same treatment the presented-mode leak got: asserted, not
   * intended. It greps the contact modules for outbound calls, because an
   * intention in a header is exactly what does not survive somebody adding
   * error reporting in six months.
   */
  const dir = join(import.meta.dirname, '..', 'src', 'lib', 'contact')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && statSync(join(dir, f)).isFile())
  assert.ok(files.length >= 2, `only ${files.length} contact modules found — has the directory moved?`)

  const OUTBOUND = /\b(fetch|captureException|captureMessage|Sentry|posthog|analytics|track|gtag|datadog)\b/
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const hit = OUTBOUND.exec(src)
    assert.equal(
      hit,
      null,
      `${f} makes an outbound call (${hit?.[0]}). A contact module must not — the number would travel with it. ` +
        'If this is genuinely needed, send redactForLog(e164) and add the call to this test by name.',
    )
  }
})

test('the control: the outbound detector fires on an outbound call', () => {
  // Without this, "no contact module calls fetch" and "the regex is wrong" are
  // the same green.
  const OUTBOUND = /\b(fetch|captureException|captureMessage|Sentry|posthog|analytics|track|gtag|datadog)\b/
  assert.match('await fetch(url)', OUTBOUND)
  assert.match('Sentry.captureException(e)', OUTBOUND)
  // And it does not fire on ordinary code, or it would be unusable.
  assert.doesNotMatch('const matched = rows.find((r) => r.id === id)', OUTBOUND)
})
