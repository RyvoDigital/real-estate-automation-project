import { toE164 } from '@/lib/jurisdiction'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * A NUMBER IN A URL, AND THE TWO THINGS THAT GO WRONG WITH IT.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief II §1.2. The contact record lives at `/c/<client>/contacts/<phone>`,
 * and both constraints on that URL are mechanical rather than stylistic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. 🔴 THE `+` MUST SURVIVE THE ROUND TRIP
 * ─────────────────────────────────────────────────────────────────────────────
 * `+` is a legal, MEANINGFUL character in a URL path segment — and in a QUERY
 * string it decodes to a SPACE. A number that arrives as `+351912345678` and
 * comes back as ` 351912345678` is silently a different number, and every
 * lookup on it returns nothing: the contact record would answer Q14 with
 * "no record" about a person who has one.
 *
 * 🔒 THE FAILURE IS INVISIBLE UNTIL IT IS NOT. Dropping the `+` works
 * perfectly for as long as every contact is in one country, because the digits
 * are unambiguous within a country. It breaks the first time a national format
 * collides with another country's — and by then the screen has been trusted
 * for months.
 *
 * So the number is percent-encoded on the way out (`%2B351…`) and re-parsed
 * through `toE164` on the way back. Not string-repaired: re-parsed, through the
 * one parser this repo has, so a mangled number is REFUSED rather than guessed
 * back into shape.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. 🔴 IT IS PERSONAL DATA THE MOMENT IT LEAVES THE PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * A number is acceptable on a page the operator is already reading. It is
 * personal data the moment it reaches a log line, an error report, an
 * analytics call or a URL pasted into a ticket — and a URL is the single most
 * pasted thing in software.
 *
 * `redactForLog` exists so that anything which might travel has an obvious,
 * greppable way to carry the contact without carrying the number.
 * `tests/contact-phone-url.test.ts` asserts the raw number does not reach an
 * outbound call from this module — asserted rather than intended, which is the
 * same treatment the presented-mode leak got.
 */

/** The encoded path segment. Always percent-encoded; never a bare `+`. */
export function toPathSegment(e164: string): string {
  return encodeURIComponent(e164)
}

/** The full address of a contact record. The one place that shape is written. */
export function contactHref(clientId: string, e164: string): string {
  return `/c/${clientId}/contacts/${toPathSegment(e164)}`
}

export type ParsedPhone =
  | { ok: true; e164: string }
  /**
   * 🔒 Refused, never repaired. A number we cannot parse is not a number we
   * may guess at: the wrong guess looks exactly like a correct lookup that
   * found nothing.
   */
  | { ok: false; reason: 'empty' | 'unparseable'; raw: string }

/**
 * Turn a path segment back into a number.
 *
 * Next has already percent-DECODED the segment by the time a page sees it, so
 * this takes the decoded value — but it is written to survive being handed the
 * encoded one too, because the two are impossible to tell apart by eye and the
 * cost of being wrong is a silent empty page.
 */
export function fromPathSegment(segment: string): ParsedPhone {
  const raw = String(segment ?? '')
  if (!raw.trim()) return { ok: false, reason: 'empty', raw }

  // Tolerate a segment that arrives still encoded, and a `+` that a query
  // string turned into a space. Neither is repaired beyond this: the result
  // goes through the real parser, which refuses anything that is not a number.
  let candidate = raw
  if (/%2B/i.test(candidate)) {
    try {
      candidate = decodeURIComponent(candidate)
    } catch {
      return { ok: false, reason: 'unparseable', raw }
    }
  }
  if (/^\s\d/.test(candidate)) candidate = `+${candidate.trimStart()}`

  const e164 = toE164(candidate)
  return e164 ? { ok: true, e164 } : { ok: false, reason: 'unparseable', raw }
}

/**
 * What a number looks like anywhere it might be stored, logged or sent.
 *
 * Keeps the country code and the last two digits: enough for an operator to
 * recognise which contact a line is about, not enough to be the contact.
 * `+351912345678` → `+351•••••78`.
 */
export function redactForLog(e164: string): string {
  const m = /^(\+\d{1,3})(\d+)(\d{2})$/.exec(e164)
  if (!m) return '•••'
  return `${m[1]}${'•'.repeat(Math.max(3, m[2].length))}${m[3]}`
}
