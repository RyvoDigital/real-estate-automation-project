/**
 * The fields we map an agency's spreadsheet onto.
 *
 * These are OUR names, not theirs. §2.3: one system calls it `Lead Source`,
 * another `Enquiry Channel`; one has a single `Budget Range` where we hold
 * budget_min and budget_max. So a mapping is not a rename table — it has to
 * express SPLITS (one column becoming two fields) and MERGES (two columns
 * becoming one field).
 */
export type Target =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'phone'
  | 'email'
  | 'budget_min'
  | 'budget_max'
  | 'budget_range'   // a split: "€1.5M – €2M" becomes budget_min + budget_max
  | 'area'
  | 'property_type'
  | 'bedrooms'
  | 'timeline'
  | 'last_contact_at'
  | 'notes'          // a merge: several free-text columns concatenate
  | 'consent'
  | 'source'
  | 'ignore'

/** source column header -> what it is. Several columns may share a target. */
export type Mapping = Record<string, Target>

export type ProposedColumn = {
  column: string
  target: Target
  confidence: 'high' | 'low'
  why: string
  samples: string[]
}

export type Proposal = {
  by: 'headers' | 'headers+model'
  columns: ProposedColumn[]
  /** Stated plainly when the model could not be reached — never silent (§2.4). */
  note?: string
}

/** §2.4. What the list contains decides what 03 can honestly do with it. */
export type Tier = 'contact_only' | 'approximate' | 'precise'

export const TIER_LABEL: Record<Tier, string> = {
  contact_only: 'Reactivation only',
  approximate: 'Approximate matching',
  precise: 'Precise matching',
}

export const TIER_MEANS: Record<Tier, string> = {
  contact_only:
    'Name and phone only. This list can be reactivated — "we haven’t spoken in a while" — but it cannot be matched against a listing, because nothing in it says what these people want.',
  approximate:
    'Budget or area, but not both plus criteria. Listings can be matched roughly. Expect misses, and expect the reasoning to be thinner than for a Concierge-captured lead.',
  precise:
    'Full criteria. This is the defensible product: matches with stated constraints, and reasoning an agent would act on.',
}

/** One row that did not make it, and why. Never dropped silently (§2.5). */
export type Reject = {
  row: number
  reason: string
  raw: Record<string, string>
}

export type Duplicate = {
  row: number
  matches: number | 'existing lead'
  on: 'phone' | 'email'
  value: string
}

export type ImportReport = {
  received: number
  accepted: number
  rejected: Reject[]
  duplicatesInFile: Duplicate[]
  duplicatesAgainstExisting: Duplicate[]
  tier: Tier
  /** Which of our fields actually got a value, and in how many rows. */
  fieldCoverage: Record<string, number>
}
