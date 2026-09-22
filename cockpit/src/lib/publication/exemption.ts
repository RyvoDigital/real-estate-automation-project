import type { SaveRefusal } from '@/lib/matching/screen-copy'
/**
 * Declaring that a property needs no energy rating.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE SAME ARTEFACT AS THE SEGMENT DECLARATION, POINTED AT A DIFFERENT    │
 * │ REGULATOR.                                                              │
 * │                                                                         │
 * │ A named person at the agency, a basis in their own words, a date. The   │
 * │ system does not qualify the exemption — it records who invoked it and   │
 * │ on what ground, and that record is what answers an IMPIC inspection     │
 * │ exactly as `consent_events` answers a data-protection one.              │
 * │                                                                         │
 * │ It is deliberately identical in shape and wording, because an agency    │
 * │ that has done the first will recognise the second, and that recognition │
 * │ is worth more than any phrasing we could invent.                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHY A DECLARATION RATHER THAN A FIELD, both failure modes being real:
 *
 *   ignore exemptions  -> a legitimately exempt property can never be published
 *                         through us, and the agency routes around the system.
 *                         Worse than not having the feature at all.
 *   a checkbox         -> it becomes the door everything walks through and the
 *                         obligation has no practical effect.
 *
 * ⚖️ The exact scope of exemption is question 2 to the lawyer. The shape does
 * not depend on the answer; if it turns out there are none, this is deleted
 * rather than left as an unused escape hatch.
 */

export type ExemptionInput = {
  listingId: string
  /** Their words. Never a dropdown — a reason we wrote is not their reason. */
  basis: string
  /** The person AT THE AGENCY who says so. */
  declaredBy: string
  /** The operator driving the screen. A different person, and the row says so. */
  recordedBy: string
  /** True when the listing already carries an energy rating. */
  alreadyRated: boolean
}

/**
 * What is wrong with this declaration, as a refusal KEY (22 Sep 2026): the
 * screen says it in the agency's language (lib/refusals.ts, SAVE_REFUSALS in
 * lib/matching/screen-copy.ts). It used to return an English sentence.
 */
export function validateExemption(input: ExemptionInput): SaveRefusal | null {
  if (!input.listingId?.trim()) return { key: 'exemption.noListing' }
  if (!input.declaredBy?.trim()) return { key: 'exemption.noDeclarer' }
  // THE RULE THE SEGMENTATION SCREEN ALREADY HOLDS. Our name on their assertion
  // would put the responsibility where the knowledge is not — and here it would
  // mean we claimed to know a property was exempt from certification.
  if (input.declaredBy.trim() === input.recordedBy?.trim()) return { key: 'exemption.sameAsRecorder', params: { name: input.declaredBy.trim() } }
  if (!input.basis?.trim()) return { key: 'exemption.noBasis' }
  // A reason so short it cannot be a reason: "n/a", "-" and "isento" are what
  // gets typed when somebody is clicking through.
  if (input.basis.trim().length < 12) return { key: 'exemption.basisTooShort', params: { basis: input.basis.trim() } }
  // A rated property needs no exemption: two answers to one question with nothing to say which governs.
  if (input.alreadyRated) return { key: 'exemption.alreadyRated' }
  return null
}

/** What gets written. `at` is set here so nobody can pass a date they chose. */
export function exemptionRecord(input: ExemptionInput): {
  declared_by: string
  basis: string
  at: string
  recorded_by: string
} {
  return {
    declared_by: input.declaredBy.trim(),
    basis: input.basis.trim(),
    at: new Date().toISOString(),
    recorded_by: input.recordedBy.trim(),
  }
}
