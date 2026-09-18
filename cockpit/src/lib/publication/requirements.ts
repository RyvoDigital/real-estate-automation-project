/**
 * What a jurisdiction requires of an advertisement, resolved for one property.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE RULE LIVES BELOW THE COUNTRY.                                       │
 * │                                                                         │
 * │ Portugal answers with one energy class and one national licence. Spain  │
 * │ answers with two ratings whose validity comes from registration with    │
 * │ one of seventeen regional registers, plus an agency registration that   │
 * │ is mandatory in two regions, voluntary in four and absent elsewhere.    │
 * │                                                                         │
 * │ A Barcelona property carries a requirement the same agency's Zaragoza   │
 * │ property does not. So requirements are DATA, resolved per property, and │
 * │ the gate asks "is every requirement satisfied" rather than reading      │
 * │ columns it happens to know the names of.                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Pure. Rows in, a requirement set out. No IO, no `server-only` — the same call
 * `gate.ts` and `jurisdiction-policy.ts` both make.
 */

export type RequirementKind = 'property_rating' | 'agency_registration'

export type Requirement = {
  id: string
  kind: RequirementKind
  /** property_rating: how many values and of what shape. */
  shape?: 'single_letter' | 'two_ratings'
  scale?: string
  /** Where registration is what CONFERS validity (Spain), not merely records it. */
  registration?: 'required' | 'not_required'
  registered_with?: string
  /** agency_registration: national, or held per region. */
  scope?: 'national' | 'regional'
  authority?: string
  /** IMPIC suspends and cancels. A licence in our record is not one valid today. */
  revocable?: boolean
  /** Whether the jurisdiction permits a declared exemption from this at all. */
  exemptible?: boolean
  /** Madrid becomes mandatory on a date. The set is resolved AS OF NOW. */
  effective_from?: string
  effective_until?: string
}

export type PolicyRow = {
  country: string
  region: string | null
  requires: Requirement[]
  regions_exhaustive: boolean
  region_required: boolean
  confirmed_at: string | null
  confirmed_by: string | null
}

export type ResolutionRefusal =
  | 'no_policy_row'
  | 'policy_not_confirmed'
  | 'region_undeclared'
  | 'region_not_enumerated'

export type Resolution =
  | { resolved: true; requirements: Requirement[]; country: string; region: string | null }
  | { resolved: false; reason: ResolutionRefusal; detail: string }

export const RESOLUTION_MEANS: Record<ResolutionRefusal, string> = {
  no_policy_row:
    'We have not analysed what this country requires of a property advertisement, so nothing ' +
    'can be published there. An unanalysed jurisdiction is a stop, never a shrug.',
  policy_not_confirmed:
    'This country has been researched but a lawyer has not confirmed our reading of it, so the ' +
    'row permits nothing. What is in doubt is our encoding of the obligations, not the ' +
    'obligations themselves — and that difference is exactly what the confirmation records.',
  region_undeclared:
    'This country regulates advertising regionally and nobody has said where this property is. ' +
    'It is not guessed from the town name: deciding a region applies a legal requirement or ' +
    'removes one, and a string match that produces a legal conclusion is a guess with a ' +
    'citation attached.',
  region_not_enumerated:
    'This property is in a region we hold no row for, and the country row does not claim its ' +
    'regions have been enumerated. Until somebody has listed which regions add requirements — ' +
    'and a lawyer has confirmed that list — a region we do not recognise is a refusal.',
}

/** A requirement in force at `now`. */
function inForce(r: Requirement, now: Date): boolean {
  const t = now.getTime()
  if (r.effective_from && new Date(r.effective_from).getTime() > t) return false
  // End of the day it lapses, matching every other date in this system.
  if (r.effective_until && new Date(r.effective_until).getTime() + 86_400_000 <= t) return false
  return true
}

/**
 * The requirement set for one property.
 *
 * REQUIREMENTS ACCUMULATE. A region adds to its country and never removes —
 * stated as an assumption rather than a fact, because it holds for every case
 * researched so far and a country where a region RELAXES a national rule is a
 * change to make with evidence in hand.
 *
 * ⚠️ AND THE ASYMMETRY, WHICH IS DELIBERATE AND IS THE PART TO READ TWICE:
 *
 *   an absent COUNTRY refuses     — we have not analysed it
 *   an absent REGION adds nothing — Aragón genuinely has no agency register,
 *                                   and demanding one would refuse a LAWFUL
 *                                   advertisement, which is how an agency stops
 *                                   using the system
 *
 * The second is only safe because of `regions_exhaustive` on the country row:
 * somebody enumerated the regions that add requirements, and a lawyer confirmed
 * the enumeration. WITHOUT THAT FLAG A MISSING REGION STILL REFUSES — so the
 * default remains deny, and the flag is where a person takes responsibility
 * rather than the system assuming a list is complete because nobody added to it.
 */
export function resolveRequirements(input: {
  country: string | null
  region: string | null
  rows: PolicyRow[]
  now?: Date
}): Resolution {
  const now = input.now ?? new Date()
  const country = input.country?.trim().toUpperCase() ?? ''
  if (!country) {
    return { resolved: false, reason: 'no_policy_row', detail: RESOLUTION_MEANS.no_policy_row }
  }

  const forCountry = input.rows.filter((r) => r.country === country)
  const national = forCountry.find((r) => r.region === null)
  if (!national) {
    return { resolved: false, reason: 'no_policy_row', detail: RESOLUTION_MEANS.no_policy_row }
  }
  if (!national.confirmed_at || !national.confirmed_by) {
    return {
      resolved: false,
      reason: 'policy_not_confirmed',
      detail: RESOLUTION_MEANS.policy_not_confirmed,
    }
  }

  const region = input.region?.trim().toUpperCase() || null

  if (national.region_required && !region) {
    return { resolved: false, reason: 'region_undeclared', detail: RESOLUTION_MEANS.region_undeclared }
  }

  let regional: PolicyRow | undefined
  if (region) {
    regional = forCountry.find((r) => r.region === region)
    if (!regional && !national.regions_exhaustive) {
      return {
        resolved: false,
        reason: 'region_not_enumerated',
        detail: `${RESOLUTION_MEANS.region_not_enumerated} Region: ${region}.`,
      }
    }
    // A region row that exists but is not confirmed cannot add its requirements
    // — and silently dropping them would publish under a rule somebody wrote
    // and nobody checked.
    if (regional && (!regional.confirmed_at || !regional.confirmed_by)) {
      return {
        resolved: false,
        reason: 'policy_not_confirmed',
        detail: `${RESOLUTION_MEANS.policy_not_confirmed} Region: ${region}.`,
      }
    }
  }

  const requirements = [...national.requires, ...(regional?.requires ?? [])]
    .filter((r) => inForce(r, now))

  return { resolved: true, requirements, country, region }
}
