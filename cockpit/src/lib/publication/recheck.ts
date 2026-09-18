import {
  clearanceStillHolds, findAgencyFact,
  type AgencyFact, type SatisfiedRequirement,
} from './gate'
import { resolveRequirements, type PolicyRow } from './requirements'

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
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUR WAYS A CLEARANCE STOPS HOLDING, AND ONLY ONE IS A DATE ON A CERTIFICATE
 * ───────────────────────────────────────────────────────────────────────────
 * The first version of this file knew one: the certificate expired. The other
 * three are mechanisms that were already in the schema and that nothing read.
 *
 *   certificate_expired      the permission lapsed — a date passed
 *   registration_revoked     IMPIC suspended or cancelled the agency's licence.
 *                            The AMI-as-a-STATE finding, arriving here rather
 *                            than at the gate: a property cleared under a
 *                            licence since suspended is in exactly the position
 *                            of one cleared under an expired certificate
 *   requirement_arrived      Madrid moves to mandatory on a date. NOBODY EDITS
 *                            ANYTHING. Properties lawfully advertised yesterday
 *                            are not today. The obligation arrived rather than
 *                            the permission lapsing — opposite direction, same
 *                            consequence, and the agency is told the same way
 *   requirement_unresolvable we can no longer say what this jurisdiction
 *                            requires — a region row appeared unconfirmed, or a
 *                            confirmation was withdrawn. NOT the same claim as
 *                            the other three and it must never be said as one:
 *                            "we cannot confirm this is still in order" is what
 *                            is true, and "this is unlawful" is not
 *
 * ALL applicable causes are reported, never the first one found. An agency told
 * only that the certificate expired buys a new certificate, and the licence is
 * still suspended.
 */

export type LapseCause =
  | 'certificate_expired'
  | 'registration_revoked'
  | 'requirement_arrived'
  | 'requirement_unresolvable'

export type ClearanceRow = {
  clearanceId: string
  listingId: string
  reference: string | null
  /**
   * What the clearance was granted on — the gate's own snapshot, unchanged.
   *
   * Was a lossy copy of it (id, expiry, exemption), which meant the re-check
   * could not tell a rating from a registration and rebuilt every row as a
   * rating to ask the date question. It now reads what was stored.
   */
  satisfied: SatisfiedRequirement[]
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
  /** Every reason this no longer holds, not the first one found. */
  causes: LapseCause[]
  /** The requirements involved, so the notice can name the thing. */
  requirementIds: string[]
  /**
   * When it stopped holding, WHERE WE KNOW.
   *
   * ⚠️ NULL IS NOT ZERO. An expiry dates itself and a newly-effective
   * requirement dates itself. A revocation does not: IMPIC suspended the
   * licence on a day nobody told us about, and the only date we hold is when we
   * last looked. Reporting "0 days ago" for it would be this system stating a
   * fact about the world that it computed from an absence — §5j, and the
   * reason `expiredOn` and `daysAgo` are both nullable.
   */
  since: string | null
  daysAgo: number | null
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

/**
 * A registration nobody has confirmed lately. NOT a failure, and not a bucket
 * a property falls into.
 *
 * ⚠️ KEYED BY THE REGISTRATION, NOT BY THE CLEARANCE, and that is the whole
 * design of it. One agency holds one AMI licence and may have forty cleared
 * properties resting on it. Listed per property, a single unchecked licence
 * produces forty identical lines and the notice becomes something nobody
 * reads — which costs more than the thing it was trying to surface.
 */
export type ToConfirm = {
  requirementId: string
  number: string
  country: string
  region: string | null
  status: AgencyFact['status']
  checkedAt: string | null
  /** Null when it has never been checked — see `since` above; null is not zero. */
  daysSinceChecked: number | null
  /** How many standing clearances rest on it. */
  affects: number
}

export type Recheck = {
  /** No longer advertisable. The agency has to be told. */
  lapsed: Lapsed[]
  /** Still advertisable, and will stop being so. Told early, it costs nothing. */
  expiringSoon: Expiring[]
  /**
   * Registrations to confirm. A SEPARATE AXIS from the three buckets below —
   * one entry can sit behind many clearances, so it is not counted in `checked`
   * and does not stop a clearance being `stillGood`.
   */
  toConfirm: ToConfirm[]
  stillGood: number
  checked: number
  warnWithinDays: number
  staleAfterDays: number
  /**
   * ⚠️ WHAT THIS RUN COULD NOT LOOK FOR, because the input it needs was not
   * supplied. Empty on a complete run.
   *
   * The first version of the widened check had no such field, and a run given
   * no policy rows reported EVERY standing clearance as one we could no longer
   * confirm. That is our own missing input arriving on the screen as a finding
   * about four hundred properties — the same family as the bare zero from a
   * remote system that is not a measurement, and as 03's
   * `thresholds_not_configured`, which is a configuration state and not a
   * statement about leads.
   *
   * A silent clean bill would have been worse still: a list with nothing in it
   * reads as "nothing is wrong", and here it would have meant "nothing was
   * looked at". Whoever renders this MUST say so rather than showing an empty
   * section.
   */
  notCheckedFor: LapseCause[]
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

/**
 * Ninety days before an agency's own assertion stops counting as evidence.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE INTERVAL THE GATE DEFERRED TO. Decided here, deliberately, because  │
 * │ the gate's departure from the design is only honest if this end exists. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The gate passes a registration whose status is `unknown`, against the design
 * line that said unknown is not valid, on the reasoning that a typed licence
 * number is the agency asserting their own licence and refusing it would
 * publish nothing until a lookup we have not built said otherwise. The design's
 * own next sentence is where the cost lands: "after some interval it should say
 * so". THIS IS THAT INTERVAL, and without it the departure is just a pass.
 *
 * Why ninety and not thirty or three hundred and sixty-five:
 *
 *   · An AMI licence is not a document with an expiry date. Nothing makes it
 *     stop being true on a schedule, so the question is not "when does this
 *     expire" but "how long before somebody saying so stops being evidence".
 *   · A suspension we never hear about sits behind every advertisement the
 *     agency runs. A quarter is short enough that it surfaces while it still
 *     matters and long enough that an agency is asked four times a year
 *     rather than monthly — and a question asked monthly is a question that
 *     gets clicked through.
 *   · It costs a line on a screen. This produces a QUESTION, never a refusal,
 *     so being wrong short is cheap in a way the gate's thresholds are not.
 *     That asymmetry is the reason it can be defaulted at all.
 *   · Ninety days is already this codebase's answer to "how long before we
 *     stop knowing" on the silence screen. Two different numbers for the same
 *     shape of question would each need defending; one needs defending once.
 *
 * ⚠️ AND NEVER CHECKED IS NOT STALE-AFTER-NINETY-DAYS. A registration with no
 * check date at all, or one whose status is `unknown`, surfaces IMMEDIATELY —
 * there is no interval to wait out, because nothing has started. Waiting ninety
 * days to ask about a licence nobody has ever confirmed would be inventing a
 * grace period out of a missing value.
 */
export const STATUS_STALE_AFTER_DAYS = 90

const DAY = 86_400_000

const daysBetween = (from: string, now: Date): number | null => {
  const t = new Date(from).getTime()
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY)) : null
}

export function recheckClearances(
  rows: ClearanceRow[],
  opts: {
    now?: Date
    warnWithinDays?: number
    staleAfterDays?: number
    /**
     * The policy AS IT STANDS NOW, not as it stood when the clearance was
     * granted. Re-resolving against today's rows is the entire mechanism by
     * which a requirement that becomes effective on a date is noticed without
     * anybody editing anything.
     *
     * ⚠️ ABSENT AND EMPTY ARE DIFFERENT, HERE AND BELOW, AND DELIBERATELY SO:
     *
     *   undefined  we were not asked to check this. The checks that need it do
     *              not run, and `notCheckedFor` says which.
     *   []         we WERE asked, and the answer is that there are no rows —
     *              a real state of the world, and every clearance resting on a
     *              jurisdiction we now hold nothing for is a real finding.
     *
     * Collapsing the two is how a database read that came back empty becomes a
     * page of findings, or how a check that never ran becomes a clean bill.
     */
    policy?: PolicyRow[]
    /** Agency registrations as they stand now, on the same absent/empty rule. */
    agencyFacts?: AgencyFact[]
  } = {},
): Recheck {
  const now = opts.now ?? new Date()
  const warnWithinDays = opts.warnWithinDays ?? WARN_WITHIN_DAYS
  const staleAfterDays = opts.staleAfterDays ?? STATUS_STALE_AFTER_DAYS
  const policy = opts.policy
  const facts = opts.agencyFacts

  const notCheckedFor: LapseCause[] = []
  if (!policy) notCheckedFor.push('requirement_arrived', 'requirement_unresolvable')
  if (!policy || !facts) notCheckedFor.push('registration_revoked')

  const lapsed: Lapsed[] = []
  const expiringSoon: Expiring[] = []
  let stillGood = 0

  /** Registration → how many standing clearances rest on it. */
  const relied = new Map<string, { fact: AgencyFact; affects: number }>()

  for (const r of rows) {
    const causes: LapseCause[] = []
    const requirementIds: string[] = []
    /** Dates we can actually defend. A cause with no date contributes none. */
    const datedFrom: string[] = []

    // --- 1. the dates on what we hold ---------------------------------------
    const dated = r.satisfied
      .filter((x) => !x.exemption && x.validUntil)
      .map((x) => x.validUntil as string)
      .sort()
    /*
     * THE SOONEST EXPIRY IS THE ONE THAT MATTERS. A property with two ratings
     * is advertisable only while BOTH hold, so the date to warn about is the
     * earliest — warning on the latest would tell an agency they have eight
     * months when they have three weeks.
     */
    const soonest = dated[0] ?? null

    if (!clearanceStillHolds({ ...r, satisfied: r.satisfied }, now)) {
      causes.push('certificate_expired')
      requirementIds.push(...r.satisfied
        .filter((x) => !x.exemption && x.validUntil && !stillValidThrough(x.validUntil, now))
        .map((x) => x.requirementId))
      if (soonest) datedFrom.push(soonest)
    }

    // --- 2. what the jurisdiction requires TODAY ----------------------------
    const resolution = policy
      ? resolveRequirements({ country: r.country, region: r.region, rows: policy, now })
      : null

    if (resolution === null) {
      // Not asked. Recorded once in `notCheckedFor`, never as a finding here.
    } else if (!resolution.resolved) {
      /*
       * We cannot say what is required here any more. Reported, because a
       * clearance resting on a reading nobody stands behind is not one we can
       * stand behind either — and reported as ITS OWN cause, because the
       * sentence "we can no longer confirm this is in order" is true and the
       * sentence "this is unlawful" is not. Only the policy row is missing;
       * the property may be perfectly compliant.
       */
      causes.push('requirement_unresolvable')
    } else {
      const held = new Set(r.satisfied.map((x) => x.requirementId))
      for (const req of resolution.requirements) {
        if (held.has(req.id)) continue
        // An obligation that arrived after this was cleared. It dates itself,
        // which is the one useful difference from a revocation.
        causes.push('requirement_arrived')
        requirementIds.push(req.id)
        if (req.effective_from) datedFrom.push(req.effective_from)
      }

      // --- 3. the registrations, as they stand now -------------------------
      for (const req of resolution.requirements) {
        if (req.kind !== 'agency_registration' || !facts) continue
        const f = findAgencyFact(facts ?? [], {
          requirementId: req.id, scope: req.scope,
          country: r.country, region: resolution.region,
        })
        if (!f) continue // an absent registration is `requirement_arrived` above
        if (f.status === 'suspended' || f.status === 'cancelled') {
          causes.push('registration_revoked')
          requirementIds.push(req.id)
          // NO DATE. We hold when we last looked, which is not when IMPIC
          // acted, and presenting the one as the other is the whole of §5j.
          continue
        }
        // Still standing on it, so it is a candidate for confirmation.
        const key = `${f.requirementId}|${f.country}|${f.region ?? ''}|${f.number}`
        const seen = relied.get(key)
        if (seen) seen.affects += 1
        else relied.set(key, { fact: f, affects: 1 })
      }
    }

    if (causes.length > 0) {
      const since = datedFrom.sort()[0] ?? null
      lapsed.push({
        clearanceId: r.clearanceId,
        listingId: r.listingId,
        reference: r.reference,
        causes: [...new Set(causes)],
        requirementIds: [...new Set(requirementIds)],
        since,
        daysAgo: since ? daysBetween(since, now) : null,
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

  /*
   * A registration surfaces for confirmation when nobody has confirmed it
   * lately — or when nobody ever has, which is not the same thing and does not
   * wait out an interval.
   */
  const toConfirm: ToConfirm[] = []
  for (const { fact, affects } of relied.values()) {
    const days = fact.statusCheckedAt ? daysBetween(fact.statusCheckedAt, now) : null
    const never = fact.status === 'unknown' || !fact.statusCheckedAt || days === null
    if (!never && (days as number) <= staleAfterDays) continue
    toConfirm.push({
      requirementId: fact.requirementId,
      number: fact.number,
      country: fact.country,
      region: fact.region,
      status: fact.status,
      checkedAt: fact.statusCheckedAt,
      daysSinceChecked: never ? null : days,
      affects,
    })
  }

  /*
   * Longest lapsed first, then soonest to expire: the one that has been
   * unlawful longest is the one to tell them about first.
   *
   * ⚠️ AND AN UNDATED ONE SORTS LAST RATHER THAN FIRST. It is not more urgent
   * than a dated one and it is not less — we simply cannot order it, and
   * treating null as 0 (bottom) or as Infinity (top) would both be this system
   * asserting a duration it does not know.
   */
  lapsed.sort((a, b) => {
    if (a.daysAgo === null && b.daysAgo === null) return a.listingId.localeCompare(b.listingId)
    if (a.daysAgo === null) return 1
    if (b.daysAgo === null) return -1
    return b.daysAgo - a.daysAgo || a.listingId.localeCompare(b.listingId)
  })
  expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft || a.listingId.localeCompare(b.listingId))
  // Most properties affected first — it is the one worth a phone call.
  toConfirm.sort((a, b) => b.affects - a.affects || a.number.localeCompare(b.number))

  return {
    lapsed, expiringSoon, toConfirm, stillGood,
    checked: rows.length, warnWithinDays, staleAfterDays, notCheckedFor,
  }
}

/** Valid THROUGH the day it expires. The convention every date here uses. */
function stillValidThrough(until: string, now: Date): boolean {
  const t = new Date(until).getTime()
  return Number.isFinite(t) && t + DAY > now.getTime()
}
