import type { Requirement } from './criteria'
import type { Detail, Reason } from './reason'

/**
 * Scoring a listing against what a lead requires.
 *
 * §4.4: every match carries its reasoning — which hard constraints are met,
 * which preferences are missed, and the evidence. "A match without an
 * explanation has failed even if it is correct."
 *
 * And §4.6: every number here comes from `client_automations.config`. There
 * are no defaults, because any value chosen now is a guess and the calibration
 * method is half an hour with a real agent. An unconfigured client produces a
 * refusal that says so, not a match computed from invented thresholds.
 */

export type Thresholds = {
  /** How far over budget_max a listing may sit, normally. 0.05 = 5%. */
  budget_stretch: number
  /** How far over when the lead SAID they could stretch. */
  budget_stretch_with_evidence: number
  /** How many fewer bedrooms than asked is still acceptable. */
  bedrooms_tolerance: number
  /** Which areas this agency's buyers treat as interchangeable (§4.3). */
  area_adjacency: Record<string, string[]>
  min_score_strong: number
  min_score_possible: number
}

export const THRESHOLD_KEYS: (keyof Thresholds)[] = [
  'budget_stretch', 'budget_stretch_with_evidence', 'bedrooms_tolerance',
  'area_adjacency', 'min_score_strong', 'min_score_possible',
]

/** Returns the missing keys. An empty array means it is safe to match. */
export function missingThresholds(cfg: unknown): string[] {
  const t = (cfg ?? {}) as Record<string, unknown>
  return THRESHOLD_KEYS.filter((k) => t[k] === undefined || t[k] === null).map(String)
}

export type Listing = {
  id: string
  reference: string | null
  area: string | null
  price: number | null
  bedrooms: number | null
  property_type: string | null
  features: string[]
  status: string
}

export type Judged = Requirement & { met: boolean; detail: Detail }

export type MatchResult = {
  /** Every hard constraint held. This, and only this, is what "a match" means. */
  matched: boolean
  /** How many of their PREFERENCES it meets. Confidence, not admission. */
  score: number
  strength: 'strong' | 'possible' | 'weak' | 'none'
  hardMet: Judged[]
  hardFailed: Judged[]
  preferencesMet: Judged[]
  preferencesMissed: Judged[]
  /** Statements a later or wider one replaced. Reported, never judged. */
  superseded: Requirement[]
  /**
   * Would a field-only CRM filter have produced this match?
   *
   * Computed from the lead's STORED FIELDS only — budget_max, area string
   * equality, bedrooms — with no tolerance and no conversation. This is what
   * makes §11 item 5 checkable rather than a claim: a match where this is
   * false, carrying verified evidence, is a match a competitor working from
   * form fields could not have produced.
   */
  filterWouldFind: boolean
  reasons: Reason[]
}

function areaAccepted(listingArea: string | null, wanted: string[], adjacency: Record<string, string[]>): { ok: boolean; detail: Detail } {
  if (!listingArea) return { ok: false, detail: { t: 'area_none' } }
  const l = listingArea.toLowerCase()
  for (const w of wanted) {
    if (w.toLowerCase() === l) return { ok: true, detail: { t: 'area_exact', area: listingArea } }
  }
  for (const w of wanted) {
    const near = (adjacency[w] ?? []).map((a) => a.toLowerCase())
    if (near.includes(l)) return { ok: true, detail: { t: 'area_adjacent', area: listingArea, near: w } }
  }
  return { ok: false, detail: { t: 'area_no', area: listingArea, wanted } }
}

export function scoreListing(input: {
  requirements: Requirement[]
  listing: Listing
  thresholds: Thresholds
  budgetFlexible: boolean
  /** The lead's stored fields, for the would-a-filter-find-it comparison. */
  fields: { budget_max: number | null; area: string | null; bedrooms: number | null }
}): MatchResult {
  const { requirements, listing, thresholds: t, fields } = input
  const judged: Judged[] = []

  /*
   * A SUPERSEDED REQUIREMENT IS NOT JUDGED — and this is what makes the mark
   * load-bearing rather than decorative.
   *
   * "ate 800 mil" followed by "afinal podemos ir ate 1 milhao" produced TWO
   * hard budgets, and every hard requirement must hold, so the lead was
   * refused a €950,000 listing by their own earlier sentence while the
   * reasoning printed both facts side by side. Recency.ts decides which one is
   * the lead's current position; this line is where that decision takes effect.
   *
   * They are still REPORTED below, because an agent who cannot see the earlier
   * statement cannot tell a correction from an extraction bug (§4.7).
   */
  const superseded = requirements.filter((r) => r.supersededBy)
  const active = requirements.filter((r) => !r.supersededBy)

  for (const r of active) {
    let met = false
    let detail: Detail = { t: 'budget_nothing_to_compare' }

    switch (r.kind) {
      case 'budget': {
        const v = r.value as { min: number | null; max: number | null }
        if (listing.price === null || v.max === null) { met = true; detail = { t: 'budget_nothing_to_compare' }; break }
        const stretch = input.budgetFlexible ? t.budget_stretch_with_evidence : t.budget_stretch
        const ceiling = v.max * (1 + stretch)
        met = listing.price <= ceiling
        detail = met
          ? listing.price <= v.max
            ? { t: 'budget_inside', price: listing.price, max: v.max }
            : { t: 'budget_stretched', price: listing.price, max: v.max, pct: Math.round(stretch * 100), stated: input.budgetFlexible }
          : { t: 'budget_beyond', price: listing.price, ceiling: Math.round(ceiling) }
        break
      }
      case 'area': {
        const a = areaAccepted(listing.area, r.value as string[], t.area_adjacency)
        met = a.ok; detail = a.detail
        break
      }
      case 'bedrooms': {
        const want = r.value as number
        if (listing.bedrooms === null) { met = false; detail = { t: 'bedrooms_unknown' }; break }
        met = listing.bedrooms >= want - t.bedrooms_tolerance
        detail = met
          ? { t: 'bedrooms_ok', has: listing.bedrooms, want }
          : { t: 'bedrooms_no', has: listing.bedrooms, want }
        break
      }
      case 'property_type': {
        const types = (r.value as string[]).map((x) => x.toLowerCase())
        met = !listing.property_type || types.includes(listing.property_type.toLowerCase())
        detail = met
          ? { t: 'type_ok', type: listing.property_type }
          : { t: 'type_no', type: listing.property_type, wanted: types }
        break
      }
      case 'feature': {
        const f = String(r.value).toLowerCase()
        met = listing.features.map((x) => x.toLowerCase()).includes(f)
        detail = met ? { t: 'feature_has', feature: f } : { t: 'feature_no', feature: f }
        break
      }
    }
    judged.push({ ...r, met, detail })
  }

  const hard = judged.filter((j) => j.strength === 'hard')
  const prefs = judged.filter((j) => j.strength === 'preference')
  const hardFailed = hard.filter((j) => !j.met)
  const preferencesMet = prefs.filter((j) => j.met)
  const preferencesMissed = prefs.filter((j) => !j.met)

  // Every hard constraint must hold. A single failure is not a weak match, it
  // is not a match — that is what makes it hard rather than a heavy weight.
  /*
   * A MATCH IS DECIDED BY THE HARD CONSTRAINTS, FULL STOP.
   *
   * The first version of this made `matched` depend on the score, and the
   * score was the preference ratio alone — so a listing that met every hard
   * constraint, including a budget stretch the lead had stated in their own
   * words, was REFUSED because it missed the single preference they mentioned.
   * The spec's own worked example failed. Preferences are confidence, not
   * admission; conflating them rebuilt the CRM filter §4.1 exists to beat.
   */
  /*
   * A MATCH NEEDS SOMETHING THAT HAD TO BE TRUE.
   *
   * With no hard constraints at all, "every hard constraint held" is
   * vacuously true and EVERY listing matches. Measured: a lead who said only
   * "we want four bedrooms" matched a one-bedroom flat as a weak match. §1 —
   * too loose and the agency spams its own database and stops trusting the
   * system, which is the failure that cannot be walked back.
   *
   * In practice budget and area are hard by default, so this fires only for a
   * lead we know almost nothing about — and for that lead the honest answer is
   * that we cannot match them yet, not that everything matches.
   */
  const hasSomethingBinding = hard.length > 0
  const matched = hasSomethingBinding && hardFailed.length === 0
  /*
   * Zero when it is not a match, whatever the preferences say.
   *
   * The preference ratio alone would give a listing that fails a hard
   * constraint but happens to have the pool they wanted a score of 1.00 —
   * which sorts ABOVE a real match in any list ordered by score. The ratio is
   * still visible in preferencesMet / preferencesMissed; it just cannot be
   * mistaken for a verdict.
   *
   * Note this is the opposite direction from the bug above: `matched` must
   * never be derived from the score, and the score must never outrank
   * `matched`.
   */
  const prefRatio = prefs.length === 0 ? 1 : preferencesMet.length / prefs.length
  const score = matched ? prefRatio : 0

  const strength: MatchResult['strength'] = !matched
    ? 'none'
    : prefRatio >= t.min_score_strong ? 'strong'
    : prefRatio >= t.min_score_possible ? 'possible'
    : 'weak'

  // WHAT A CRM WOULD HAVE DONE. Stored fields, exact strings, no tolerance,
  // no conversation.
  const filterWouldFind =
    (fields.budget_max === null || listing.price === null || listing.price <= fields.budget_max) &&
    (fields.area === null || (listing.area ?? '').toLowerCase() === fields.area.toLowerCase()) &&
    (fields.bedrooms === null || (listing.bedrooms ?? -1) >= fields.bedrooms)

  /*
   * REASONS ARE DATA. This function no longer writes a sentence in any
   * language — see reason.ts. The agency is Portuguese and this code sits four
   * files away from anything that knows who is reading.
   */
  const reasons: Reason[] = []
  for (const r of superseded) {
    reasons.push({
      role: 'superseded',
      rule: r.supersededBy?.rule ?? 'later',
      evidence: r.evidence,
      instead: r.supersededBy?.evidence ?? null,
    })
  }
  if (!hasSomethingBinding) reasons.push({ role: 'nothing_binding' })
  for (const h of hard.filter((j) => j.met)) reasons.push({ role: 'met', detail: h.detail, evidence: h.evidence })
  for (const p of preferencesMissed) reasons.push({ role: 'missed', detail: p.detail, evidence: p.evidence })
  for (const h of hardFailed) reasons.push({ role: 'failed', detail: h.detail, evidence: h.evidence })

  return { matched, score, strength, hardMet: hard.filter((j) => j.met), hardFailed, preferencesMet, preferencesMissed, superseded, filterWouldFind, reasons }
}
