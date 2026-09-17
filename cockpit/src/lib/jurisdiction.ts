import parsePhoneNumberFromString, { type CountryCode } from 'libphonenumber-js'

/**
 * Which country's law governs a message to this number.
 *
 * The rule that makes worldwide expansion tractable: the applicable law is the
 * RECIPIENT's, not the agency's. A Lisbon agency messaging a Spanish contact is
 * bound by Spanish law. That is a property of the phone number, which makes it
 * data rather than judgement — and this module is where it stops being a
 * judgement.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ LANGUAGE AND JURISDICTION ARE DIFFERENT FACTS. NEVER DERIVE ONE FROM    │
 * │ THE OTHER.                                                              │
 * │                                                                         │
 * │ The Concierge resolves LANGUAGE from the text of the message            │
 * │ (src/language.js, detectLanguage). This module resolves JURISDICTION    │
 * │ from the number. They disagree constantly and are both right: a         │
 * │ Portuguese-speaking person with a Spanish number, a Brit living in      │
 * │ Spain, a Brazilian number in Lisbon.                                    │
 * │                                                                         │
 * │ Language governs what the reply is WRITTEN IN. Jurisdiction governs     │
 * │ WHETHER WE MAY SEND AT ALL. Collapsing them into one "country" field —  │
 * │ which looks like a simplification — would subject a Spanish resident to │
 * │ Portuguese rules because they happened to type in Portuguese.           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHY libphonenumber AND NOT A PREFIX TABLE
 * `+1` is the United States AND Canada AND some twenty Caribbean countries,
 * separated by area code rather than country code. Meta blocks marketing
 * templates to +1 at the platform level, so a `startsWith('+1')` would look
 * right for years and then assign US rules to a Canadian, or a Dominican
 * number to nowhere. The library knows the area-code ranges; we do not.
 *
 * WHERE THIS CAN RUN, WHICH IS A CONSTRAINT ON THE GATE (Stage 1, piece 4)
 * libphonenumber-js is an npm dependency available to the cockpit and NOT to an
 * n8n code node — which is why everything in src/*.js is dependency-free. So
 * the send gate cannot resolve jurisdiction inside a code node. Either the gate
 * runs in the cockpit, or the resolution is persisted before n8n ever sees the
 * contact. That is a decision to be made deliberately when the gate is built,
 * not settled by whichever file happens to be written first.
 */

export type JurisdictionRefusal = 'empty' | 'unparseable' | 'invalid' | 'no_country'

export type Jurisdiction =
  | { ok: true; e164: string; country: CountryCode }
  // A valid number in a non-geographic range: storable, but no law follows from
  // it. The number is carried on the refusal because storing a contact and
  // messaging one are different decisions, and only the second needs a country.
  | { ok: false; reason: 'no_country'; raw: string; e164: string }
  | { ok: false; reason: 'empty' | 'unparseable' | 'invalid'; raw: string }

/** Human wording for the operator screen. A refusal has to say WHICH refusal. */
export const REFUSAL_MEANS: Record<JurisdictionRefusal, string> = {
  empty: 'No number at all. Nothing to resolve, and nothing went wrong.',
  unparseable: 'Not readable as a phone number — digits lost, or not a number.',
  invalid: 'Readable, but not a valid number in any country. Usually a typo or a landline written wrong.',
  no_country:
    'A valid number with no country: satellite, or one of the non-geographic ranges. ' +
    'No law follows from it, so it is not contactable.',
}

/**
 * A spreadsheet phone column is a graveyard, and the cleaning is ONE rule so
 * that `toE164` and `resolveJurisdiction` can never disagree about what a cell
 * says (lesson 15: two copies diverge and the stale one reports confidently).
 */
function clean(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  // Excel turns a long number into "9.12346E+11" and the digits are already
  // gone. Refuse rather than parse what is left.
  if (/e\+/i.test(s)) return null
  return s.replace(/\.0+$/, '').replace(/^00/, '+')
}

export function resolveJurisdiction(raw: string, defaultCountry: CountryCode = 'PT'): Jurisdiction {
  const original = (raw ?? '').trim()
  if (!original) return { ok: false, reason: 'empty', raw: original }

  const cleaned = clean(original)
  if (cleaned === null) return { ok: false, reason: 'unparseable', raw: original }

  const p = parsePhoneNumberFromString(cleaned, defaultCountry)
  if (!p) return { ok: false, reason: 'unparseable', raw: original }
  if (!p.isValid()) return { ok: false, reason: 'invalid', raw: original }
  // Non-geographic ranges parse and validate but belong to no country, so no
  // law follows from them. `undefined` here is a real answer, not a library gap.
  if (!p.country) return { ok: false, reason: 'no_country', raw: original, e164: p.number }

  return { ok: true, e164: p.number, country: p.country }
}

/**
 * E.164 or nothing — the older, narrower question, kept because plenty of
 * callers only need the number. It DELEGATES rather than parsing again, so
 * there is one parser and one cleaning rule in this file.
 */
export function toE164(raw: string, defaultCountry: CountryCode = 'PT'): string | null {
  const r = resolveJurisdiction(raw, defaultCountry)
  if (r.ok) return r.e164
  // `no_country` still yields a usable number; every other refusal does not.
  return r.reason === 'no_country' ? r.e164 : null
}
