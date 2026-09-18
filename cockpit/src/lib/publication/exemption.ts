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
 * What is wrong with this declaration, as a sentence.
 *
 * Returns prose rather than a code for the same reason `validateDeclaration`
 * does: it is read by somebody standing next to the person who has just made
 * the declaration, and "invalid" is not a thing to say out loud in that room.
 */
export function validateExemption(input: ExemptionInput): string | null {
  if (!input.listingId?.trim()) return 'An exemption has to be about a property.'

  if (!input.declaredBy?.trim()) {
    return (
      'A declaration needs the name of the person at the agency who made it. ' +
      'Not the operator recording it: responsibility follows knowledge, and 0028 refuses the row.'
    )
  }

  // THE RULE THE SEGMENTATION SCREEN ALREADY HOLDS. Our name on their assertion
  // would put the responsibility where the knowledge is not — and here it would
  // mean we claimed to know a property was exempt from certification.
  if (input.declaredBy.trim() === input.recordedBy?.trim()) {
    return (
      `"${input.declaredBy}" is both the declarer and the recorder. The agency declares and we ` +
      'record; if they are the same person the row claims we decided this property needs no rating.'
    )
  }

  if (!input.basis?.trim()) {
    return (
      'An exemption needs the reason, in their words. Without it the row says a property needs no ' +
      'energy rating and cannot say why — which is the one thing an inspection would ask.'
    )
  }

  // A reason so short it cannot be a reason. Not a length rule for its own
  // sake: "n/a", "-" and "isento" are what gets typed when somebody is
  // clicking through, and a declaration nobody meant is worse than none.
  if (input.basis.trim().length < 12) {
    return (
      `"${input.basis.trim()}" is too short to be a reason. An inspection asks why this property ` +
      'needs no rating, and the answer has to be a sentence somebody at the agency would stand behind.'
    )
  }

  // A rated property does not need an exemption, and accepting one would leave
  // two answers to the same question with nothing to say which governs.
  if (input.alreadyRated) {
    return (
      'This property already has an energy rating on record, so it needs no exemption. ' +
      'If the rating is wrong, correct the rating.'
    )
  }

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
