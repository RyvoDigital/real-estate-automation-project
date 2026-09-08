import type { CountryCode } from 'libphonenumber-js'
import {
  cleanName,
  normaliseEmail,
  parseBedrooms,
  parseBudgetRange,
  parseConsent,
  parseDate,
  parseMoney,
  toE164,
} from './normalise'
import type { ParsedRow } from './parse'
import type { Duplicate, ImportReport, Mapping, Reject, Tier } from './types'

/**
 * Applying an approved mapping to parsed rows.
 *
 * This is the step that decides what actually lands, so everything it refuses
 * it refuses BY NAME. "Imported 847 of 900" with the 53 listed beats "imported
 * successfully" — §2.5, and the same instinct as every entry in the lessons
 * file: a silent drop is indistinguishable from a clean run.
 */

export type Candidate = {
  row: number
  full_name: string | null
  phone: string | null
  email: string | null
  budget_min: number | null
  budget_max: number | null
  area: string | null
  property_type: string | null
  bedrooms: number | null
  timeline: string | null
  last_contact_at: string | null
  notes: string | null
  consent_status: 'opt_in' | 'opt_out' | 'unknown'
  source: string | null
  /** What this row alone can support (§2.4), before any list-level rounding. */
  tier: Tier
}

export type Plan = {
  candidates: Candidate[]
  report: ImportReport
}

const TIER_ORDER: Tier[] = ['contact_only', 'approximate', 'precise']

/** What one row can honestly support. Nothing here is a threshold — it is a
 *  statement about which fields have values. */
export function rowTier(c: Candidate): Tier {
  const hasContact = Boolean(c.phone || c.email)
  if (!hasContact) return 'contact_only'
  const hasBudget = c.budget_min !== null || c.budget_max !== null
  const hasArea = Boolean(c.area)
  const hasCriteria = c.bedrooms !== null || Boolean(c.property_type) || Boolean(c.notes)
  if (hasBudget && hasArea && hasCriteria) return 'precise'
  if (hasBudget || hasArea) return 'approximate'
  return 'contact_only'
}

function cols(mapping: Mapping, target: string): string[] {
  return Object.entries(mapping)
    .filter(([, t]) => t === target)
    .map(([c]) => c)
}

function firstValue(row: Record<string, string>, columns: string[]): string {
  for (const c of columns) {
    const v = (row[c] ?? '').trim()
    if (v) return v
  }
  return ''
}

function joined(row: Record<string, string>, columns: string[], sep: string): string {
  return columns
    .map((c) => (row[c] ?? '').trim())
    .filter(Boolean)
    .join(sep)
}

export function planImport(
  rows: ParsedRow[],
  mapping: Mapping,
  opts: {
    defaultCountry?: CountryCode
    /** Normalised phones and lowercased emails already in this client's leads. */
    existingPhones?: Set<string>
    existingEmails?: Set<string>
    /** Rows the parser already refused, carried into one report. */
    parseErrors?: Reject[]
  } = {},
): Plan {
  const country = opts.defaultCountry ?? 'PT'
  const existingPhones = opts.existingPhones ?? new Set()
  const existingEmails = opts.existingEmails ?? new Set()

  const rejected: Reject[] = [...(opts.parseErrors ?? [])]
  const duplicatesInFile: Duplicate[] = []
  const duplicatesAgainstExisting: Duplicate[] = []
  const candidates: Candidate[] = []

  const seenPhone = new Map<string, number>()
  const seenEmail = new Map<string, number>()

  const nameCols = [...cols(mapping, 'full_name'), ...cols(mapping, 'first_name'), ...cols(mapping, 'last_name')]
  const firstCols = cols(mapping, 'first_name')
  const lastCols = cols(mapping, 'last_name')
  const fullCols = cols(mapping, 'full_name')

  rows.forEach(({ line: rowNo, values: row }) => {
    // The line the row came from, never its position in the array — see
    // ParsedRow. Every number in this report is a line the operator can open.

    // A MERGE: First Name + Last Name become one field (§2.3).
    const full = firstValue(row, fullCols)
    const merged = [firstValue(row, firstCols), firstValue(row, lastCols)].filter(Boolean).join(' ')
    const name = cleanName(full || merged)

    const phone = toE164(firstValue(row, cols(mapping, 'phone')), country)
    const email = normaliseEmail(firstValue(row, cols(mapping, 'email')))

    // A SPLIT: one "Budget Range" column becomes budget_min and budget_max.
    const rangeRaw = firstValue(row, cols(mapping, 'budget_range'))
    const range = rangeRaw ? parseBudgetRange(rangeRaw) : { min: null, max: null }
    const budget_min = parseMoney(firstValue(row, cols(mapping, 'budget_min'))) ?? range.min
    const budget_max = parseMoney(firstValue(row, cols(mapping, 'budget_max'))) ?? range.max

    const c: Candidate = {
      row: rowNo,
      full_name: name,
      phone,
      email,
      budget_min,
      budget_max,
      area: firstValue(row, cols(mapping, 'area')) || null,
      property_type: firstValue(row, cols(mapping, 'property_type')) || null,
      bedrooms: parseBedrooms(firstValue(row, cols(mapping, 'bedrooms'))),
      timeline: firstValue(row, cols(mapping, 'timeline')) || null,
      last_contact_at: parseDate(firstValue(row, cols(mapping, 'last_contact_at'))),
      // A MERGE again: every free-text column concatenates, labelled, because
      // §4.2 will read this and needs to know which column said what.
      notes:
        cols(mapping, 'notes')
          .map((col) => {
            const v = (row[col] ?? '').trim()
            return v ? `${col}: ${v}` : ''
          })
          .filter(Boolean)
          .join('\n') || null,
      consent_status: parseConsent(firstValue(row, cols(mapping, 'consent'))),
      source: firstValue(row, cols(mapping, 'source')) || null,
      tier: 'contact_only',
    }
    c.tier = rowTier(c)

    // A contact we cannot reach is not a lead. This is the one rejection that
    // is about the data rather than the parsing, and it is stated as such.
    if (!c.phone && !c.email) {
      const rawPhone = firstValue(row, cols(mapping, 'phone'))
      const rawEmail = firstValue(row, cols(mapping, 'email'))
      rejected.push({
        row: rowNo,
        reason:
          rawPhone || rawEmail
            ? `no usable contact — phone ${rawPhone ? `"${rawPhone}" could not be read as a number` : 'is empty'}, email ${rawEmail ? `"${rawEmail}" is not a valid address` : 'is empty'}`
            : 'no phone and no email',
        raw: row,
      })
      return
    }

    if (c.phone) {
      const prior = seenPhone.get(c.phone)
      if (prior !== undefined) {
        duplicatesInFile.push({ row: rowNo, matches: prior, on: 'phone', value: c.phone })
        return
      }
      if (existingPhones.has(c.phone)) {
        duplicatesAgainstExisting.push({ row: rowNo, matches: 'existing lead', on: 'phone', value: c.phone })
        return
      }
      seenPhone.set(c.phone, rowNo)
    }
    if (c.email) {
      const prior = seenEmail.get(c.email)
      if (prior !== undefined) {
        duplicatesInFile.push({ row: rowNo, matches: prior, on: 'email', value: c.email })
        return
      }
      if (existingEmails.has(c.email)) {
        duplicatesAgainstExisting.push({ row: rowNo, matches: 'existing lead', on: 'email', value: c.email })
        return
      }
      seenEmail.set(c.email, rowNo)
    }

    candidates.push(c)
  })

  // Coverage is reported as raw counts so the tier below cannot overstate it.
  const fields: (keyof Candidate)[] = [
    'full_name', 'phone', 'email', 'budget_min', 'budget_max',
    'area', 'property_type', 'bedrooms', 'timeline', 'last_contact_at', 'notes',
  ]
  const fieldCoverage: Record<string, number> = {}
  for (const f of fields) fieldCoverage[f] = candidates.filter((c) => c[f] !== null).length

  /*
   * The list's headline tier is the tier of the MEDIAN row, and the
   * distribution is reported beside it.
   *
   * Deliberately not "the tier at least X% of rows reach": any X is a guess,
   * and §4.6 is explicit that a value chosen now is a guess. The median needs
   * no threshold, and showing the distribution means the operator sees a list
   * that is half precise and half unusable for what it is, rather than being
   * handed one adjective.
   */
  const byTier = TIER_ORDER.map((t) => candidates.filter((c) => c.tier === t).length)
  const sorted = candidates.map((c) => TIER_ORDER.indexOf(c.tier)).sort((a, b) => a - b)
  const tier: Tier = sorted.length ? TIER_ORDER[sorted[Math.floor(sorted.length / 2)]] : 'contact_only'

  return {
    candidates,
    report: {
      received: rows.length + (opts.parseErrors?.length ?? 0),
      accepted: candidates.length,
      rejected,
      duplicatesInFile,
      duplicatesAgainstExisting,
      tier,
      fieldCoverage: {
        ...fieldCoverage,
        _tier_contact_only: byTier[0],
        _tier_approximate: byTier[1],
        _tier_precise: byTier[2],
      },
    },
  }
}
