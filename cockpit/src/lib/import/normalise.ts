import type { ConsentClaim } from './types'

import parsePhoneNumberFromString, { type CountryCode } from 'libphonenumber-js'

/**
 * Turning a spreadsheet cell into a value we can match on.
 *
 * Everything here is a pure function over a string, because everything here is
 * a judgement that will be wrong for some agency and has to be testable against
 * the real shapes rather than reasoned about.
 */

/**
 * E.164 or nothing — §2.5, and the same reason recorded at E3.
 *
 * MOVED to ../jurisdiction.ts and re-exported here so existing callers are
 * unaffected. It is a re-export and not a second copy on purpose: the cleaning
 * rules for a spreadsheet phone cell now have exactly one home, shared with
 * resolveJurisdiction, because two copies of a parser diverge and the stale one
 * keeps answering confidently (lesson 15).
 */
export { toE164 } from '../jurisdiction'

export function normaliseEmail(raw: string): string | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  // Deliberately permissive: this decides whether we STORE it, not whether we
  // send to it. A rejected address is a lost contact; a stored bad one is a
  // bounce we can see.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(s)) return null
  return s
}

/**
 * Money out of whatever the agency typed.
 *
 * Iberian spreadsheets mix conventions constantly: "1.500.000" is one and a
 * half million with dots as thousands, "1,5M" is the same number with a comma
 * decimal, and "1,500,000" is the same number again in the anglophone
 * convention. Guessing wrong is a factor of a thousand, so the rules are
 * explicit rather than clever.
 */
export function parseMoney(raw: string): number | null {
  let s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  s = s.replace(/[€$£\s]/g, '').replace(/eur(os)?$/i, '')
  if (!s) return null

  // A trailing multiplier: 1.5m, 1,5 m, 850k, 850 mil
  let mult = 1
  const m = s.match(/(m|mm|mio|k|mil)$/)
  if (m) {
    mult = m[1] === 'k' || m[1] === 'mil' ? 1_000 : 1_000_000
    s = s.slice(0, -m[1].length)
  }

  const dots = (s.match(/\./g) || []).length
  const commas = (s.match(/,/g) || []).length

  if (dots && commas) {
    // Both present: whichever comes last is the decimal separator.
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    s = s.split(thousands).join('').replace(decimal, '.')
  } else if (commas) {
    // "1,5" is a decimal; "1,500" and "1,500,000" are thousands groups.
    const parts = s.split(',')
    const grouped = parts.length > 1 && parts.slice(1).every((p) => p.length === 3)
    s = grouped ? parts.join('') : s.replace(',', '.')
  } else if (dots) {
    const parts = s.split('.')
    const grouped = parts.length > 1 && parts.slice(1).every((p) => p.length === 3)
    if (grouped) s = parts.join('')
  }

  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  const value = n * mult
  // "1.5" in a budget column means 1.5 million, not one euro fifty. Anything
  // under a thousand with no multiplier is a unit we have misread, so we say
  // we do not know rather than storing a number that is wrong by 10^6.
  if (value < 1000) return null
  return Math.round(value)
}

/** "€1.5M - €2M", "1.500.000 a 2.000.000", "up to 2M", "800k+" */
export function parseBudgetRange(raw: string): { min: number | null; max: number | null } {
  const s = (raw ?? '').trim()
  if (!s) return { min: null, max: null }

  const openUp = /^(up to|até|hasta|max(imo)?|<=?)\s*/i
  const openDown = /(\+|or more|ou mais|o más|>=?)\s*$/i

  if (openUp.test(s)) return { min: null, max: parseMoney(s.replace(openUp, '')) }
  if (openDown.test(s)) return { min: parseMoney(s.replace(openDown, '')), max: null }

  // A separator that is not a decimal comma and not a thousands dot.
  const parts = s.split(/\s*(?:-|–|—|\bto\b|\ba\b|\bhasta\b|\baté\b)\s*/i).filter(Boolean)
  if (parts.length >= 2) {
    const min = parseMoney(parts[0])
    const max = parseMoney(parts[1])
    if (min !== null || max !== null) {
      // Agencies write ranges backwards often enough to be worth handling.
      if (min !== null && max !== null && min > max) return { min: max, max: min }
      return { min, max }
    }
  }
  const one = parseMoney(s)
  return { min: one, max: one }
}

/**
 * Bedrooms.
 *
 * `T3` is not a typo — it is how Portuguese property is written, and it means
 * three bedrooms. An importer for this market that cannot read a typology is
 * an importer that drops the bedroom column for most Portuguese agencies.
 * Spain writes `3 dorm.`; the UK writes `3 bed`.
 */
export function parseBedrooms(raw: string): number | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  const t = s.match(/^t\s*(\d{1,2})/i)              // T3, T 3
  if (t) return Number(t[1])
  const v = s.match(/^v\s*(\d{1,2})/i)              // V4 — a detached typology
  if (v) return Number(v[1])
  const n = s.match(/(\d{1,2})\s*(\+)?\s*(bed|bedroom|quarto|dorm|hab)?/i)
  if (n) {
    const num = Number(n[1])
    if (num >= 0 && num <= 20) return num
  }
  return null
}

/**
 * A consent column read as what it actually is: the agency's CLAIM.
 *
 * This function used to be `parseConsent` and used to return `'opt_in'`, which
 * the importer wrote straight into `leads.consent_status` with `consent_at =
 * new Date()`. A cell reading `sim` became, in our database, a person who
 * consented — at the moment of import. Both halves were false: the cell is an
 * assertion the agency cannot evidence, and the timestamp was the import clock
 * in a field that means when a person consented.
 *
 * So the reading survives and the CONCLUSION does not. There is no longer any
 * way for a caller to obtain a consent state from a spreadsheet, because the
 * only thing returned is the claim: the exact cell text, and what we read it
 * as. Consent itself lives in the ledger and arrives by other routes.
 *
 * See docs/consent-ledger-design.md §1 and §6.
 */
export function readConsentClaim(raw: string): ConsentClaim | null {
  const original = (raw ?? '').trim()
  if (!original) return null            // no cell is no claim, not an unknown one
  const s = original.toLowerCase()
  const parsed: ConsentClaim['parsed'] =
    /^(y|yes|true|1|sim|si|sí|opt[ _-]?in|consent(ed)?|subscribed)$/.test(s) ? 'opt_in'
    : /^(n|no|false|0|não|nao|opt[ _-]?out|unsubscribed|baixa)$/.test(s) ? 'opt_out'
    : 'unknown'
  return { raw: original, parsed }
}

/**
 * A date out of a spreadsheet, or null.
 *
 * DD/MM/YYYY and MM/DD/YYYY are indistinguishable for the first twelve days of
 * every month, and there is no way to tell them apart from one cell. We are
 * selling into Portugal and Spain, so day-first is the right assumption — and
 * it is an ASSUMPTION, stated here and surfaced in the review screen rather
 * than buried.
 */
export function parseDate(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy
    if (y.length === 2) y = Number(y) > 70 ? `19${y}` : `20${y}`
    const day = Number(d), mon = Number(m)
    if (mon > 12) return null            // unambiguous, and it is month-first
    if (day > 31 || day < 1 || mon < 1) return null
    const dt = new Date(Date.UTC(Number(y), mon - 1, day))
    if (dt.getUTCMonth() !== mon - 1 || dt.getUTCDate() !== day) return null
    return dt.toISOString().slice(0, 10)
  }

  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10)
  return null
}

export function cleanName(raw: string): string | null {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  // A name column full of "-", "n/a" or "unknown" is empty, not a person.
  if (/^(n\/?a|unknown|desconhecido|-{1,}|\.+)$/i.test(s)) return null
  return s
}
