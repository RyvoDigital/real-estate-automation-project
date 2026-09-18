import { clearanceStillHolds } from './gate'

/**
 * What has stopped being advertisable, and what we can actually do about it.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PUBLICATION IS A STATE, NOT A MOMENT.                                   │
 * │                                                                         │
 * │ A certificate expires. A property lawfully advertised in March is       │
 * │ unlawfully advertised in December with no data having changed and       │
 * │ nobody having acted. So this is not a check at the moment of            │
 * │ publishing — it is a standing check over everything already cleared.    │
 * │                                                                         │
 * │ The general form is worth keeping: a permission that can expire         │
 * │ without anyone acting is one that has to be RE-ASKED rather than        │
 * │ granted.                                                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠️ AND THE HONEST LIMIT, WHICH IS THE WHOLE REASON THIS FILE IS CAREFUL
 * ───────────────────────────────────────────────────────────────────────────
 * WE CANNOT WITHDRAW A POST WE DID NOT PUBLISH.
 *
 * Automation 04 prepares a piece and a person at the agency publishes it,
 * wherever they publish. That was chosen deliberately — holding a client's
 * credentials to post public commercial content under their brand risks the
 * WhatsApp asset every other automation runs on — and it has a cost, which is
 * this: the gate can prevent a publication and cannot reverse one.
 *
 * So what this produces is A NOTICE, NOT AN ACTION. The operator is told, the
 * agency is told, and the fact that they were told is recorded. **That is the
 * whole of it**, and nothing here or in the copy may imply otherwise.
 *
 * A notice that reads like an action is worse than one that reads like a
 * warning: somebody reads "the advertisement was corrected", believes the
 * problem is closed, and the unlawful advertisement is still up — with our
 * record saying it was handled.
 */

export type ClearanceRow = {
  clearanceId: string
  listingId: string
  reference: string | null
  /**
   * What the clearance was granted on, per requirement — the same snapshot the
   * gate returns.
   *
   * Was `energyClass` + `amiLicence` + one expiry date, which was Portugal's
   * answer standing in for the question. A Spanish property holds two ratings
   * and a registration, each with its own validity, and the SOONEST of them is
   * what decides whether the clearance still holds.
   */
  satisfied: {
    requirementId: string
    validUntil: string | null
    exemption: { declared_by: string; basis: string; at: string } | null
  }[]
  country: string
  region: string | null
  decidedAt: string
  /** When the agency was last told about this one, if ever. */
  noticeSentAt: string | null
}

export type Lapsed = {
  clearanceId: string
  listingId: string
  reference: string | null
  expiredOn: string | null
  daysAgo: number
  /** Told already — so a second notice is a choice, not an oversight. */
  noticeSentAt: string | null
}

export type Expiring = {
  clearanceId: string
  listingId: string
  reference: string | null
  expiresOn: string
  daysLeft: number
}

export type Recheck = {
  /** No longer advertisable. The agency has to be told. */
  lapsed: Lapsed[]
  /** Still advertisable, and will stop being so. Told early, it costs nothing. */
  expiringSoon: Expiring[]
  stillGood: number
  checked: number
  warnWithinDays: number
}

/**
 * Thirty days of warning.
 *
 * A guess, and stated as one — but not the kind §4.6 refuses to default. That
 * rule exists because a wrong matching threshold silently spams a database or
 * silently hides a buyer. This decides how early somebody is told about a date
 * that is already in the row: too early is a longer list, too late is a shorter
 * warning, and neither reaches a lead or publishes anything. Different blast
 * radius, different treatment — the same reasoning as the silence screen's
 * ninety days.
 */
export const WARN_WITHIN_DAYS = 30

const DAY = 86_400_000

export function recheckClearances(
  rows: ClearanceRow[],
  opts: { now?: Date; warnWithinDays?: number } = {},
): Recheck {
  const now = opts.now ?? new Date()
  const warnWithinDays = opts.warnWithinDays ?? WARN_WITHIN_DAYS

  const lapsed: Lapsed[] = []
  const expiringSoon: Expiring[] = []
  let stillGood = 0

  for (const r of rows) {
    const holds = clearanceStillHolds(
      {
        listingId: r.listingId,
        country: r.country,
        region: r.region,
        satisfied: r.satisfied.map((x) => ({
          requirementId: x.requirementId, kind: 'property_rating' as const,
          values: {}, number: null, validUntil: x.validUntil, exemption: x.exemption,
        })),
        decidedAt: r.decidedAt,
      },
      now,
    )

    /*
     * THE SOONEST EXPIRY IS THE ONE THAT MATTERS. A property with two ratings
     * is advertisable only while BOTH hold, so the date to warn about is the
     * earliest — warning on the latest would tell an agency they have eight
     * months when they have three weeks.
     */
    const dated = r.satisfied
      .filter((x) => !x.exemption && x.validUntil)
      .map((x) => x.validUntil as string)
      .sort()
    const soonest = dated[0] ?? null

    if (!holds) {
      const t = soonest ? new Date(soonest).getTime() : NaN
      lapsed.push({
        clearanceId: r.clearanceId,
        listingId: r.listingId,
        reference: r.reference,
        expiredOn: soonest,
        daysAgo: Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY)) : 0,
        noticeSentAt: r.noticeSentAt,
      })
      continue
    }

    // Nothing dated to expire — every requirement is satisfied by a declared
    // exemption, or by something with no validity window at all.
    if (!soonest) { stillGood += 1; continue }

    const t = new Date(soonest).getTime()
    /*
     * END OF THE EXPIRY DAY, matching the gate exactly.
     *
     * `clearanceStillHolds` treats a certificate as valid THROUGH the day it
     * expires — being stricter than the law refuses a property the agency may
     * lawfully advertise. Counting from the START of that day here made the two
     * halves of one feature disagree by a day: a certificate the gate still
     * accepted would have been reported with "0 days left", and one expiring
     * tomorrow read as expiring today.
     *
     * Caught by a test asserting 10 and getting 9. The off-by-one is invisible
     * in either file alone and only appears where they are compared.
     */
    const daysLeft = Math.floor((t + DAY - now.getTime()) / DAY)
    if (daysLeft <= warnWithinDays) {
      expiringSoon.push({
        clearanceId: r.clearanceId,
        listingId: r.listingId,
        reference: r.reference,
        expiresOn: soonest,
        daysLeft: Math.max(0, daysLeft),
      })
      continue
    }
    stillGood += 1
  }

  // Longest lapsed first, then soonest to expire. The one that has been
  // unlawful longest is the one to tell them about first.
  lapsed.sort((a, b) => b.daysAgo - a.daysAgo || a.listingId.localeCompare(b.listingId))
  expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft || a.listingId.localeCompare(b.listingId))

  return { lapsed, expiringSoon, stillGood, checked: rows.length, warnWithinDays }
}
