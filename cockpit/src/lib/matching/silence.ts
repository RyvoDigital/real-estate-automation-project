/**
 * The silence: people who told you what they wanted, and nobody has spoken to.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ "Fourteen people told you what they wanted and nobody has spoken to     │
 * │ them in ninety days."                                                   │
 * │                                                                         │
 * │ THE FORCE IS IN THE CONJUNCTION, so the computation is too. A list of   │
 * │ dormant contacts is what a CRM already shows and nobody reads. A list   │
 * │ of people who SAID SOMETHING and were then left alone is an accusation  │
 * │ the agency can act on — and it is made entirely from data that already  │
 * │ exists, before any threshold is configured and before anything is sent. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT "TOLD YOU" MEANS, PRECISELY
 * ───────────────────────────────────────────────────────────────────────────
 * A requirement whose source is `conversation` or `note`: the lead's own words,
 * either to the Concierge or written down by whoever took the call.
 *
 * NOT `field` — a value in a spreadsheet column is the agency's record, not the
 * person speaking, and the whole argument of this screen is that somebody said
 * something. NOT `agent` either: an agent's own note about a contact is the
 * agency talking to itself, and counting it would let the agency generate its
 * own accusations.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT "NOBODY HAS SPOKEN TO THEM" MEANS
 * ───────────────────────────────────────────────────────────────────────────
 * The LATEST of every clock we hold — the imported `last_contact_at` and the
 * most recent message in either direction. Using one alone gets it wrong in
 * both directions: a Concierge lead has no imported date and would look
 * eternally silent, and an imported contact who wrote in last week would look
 * silent because the spreadsheet says 2022.
 *
 * A lead with NO clock at all is not silent for an unknown length of time — it
 * is unknown, and it is reported as its own count rather than folded in. A
 * number that quietly includes "we have no idea" is the kind that gets quoted
 * at an agency and then cannot be defended.
 */

export type SilenceInput = {
  leadId: string
  name: string | null
  /** From the import. May be absent for a Concierge-captured lead. */
  lastContactAt: string | null
  /** The most recent message either way. Absent if there has never been one. */
  lastMessageAt: string | null
  /** Sources of the requirements we hold for them. */
  requirementSources: string[]
}

export type SilentLead = {
  leadId: string
  name: string | null
  days: number
  /** The clock the number came from, so a figure can be defended. */
  since: string
}

export type Silence = {
  silent: SilentLead[]
  /** Told us something, and we cannot say when anyone last spoke to them. */
  unknownClock: number
  /** Told us something and were spoken to recently. Not a problem; counted. */
  recentlySpoken: number
  /** Everyone we hold nothing spoken from. Not this screen's subject. */
  saidNothing: number
  thresholdDays: number
}

/** Sources that count as the person having said something. */
const SPOKEN: string[] = ['conversation', 'note']

/**
 * Ninety days, from the specification (§7) rather than from a guess.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT TREATED LIKE A MATCHING THRESHOLD. §4.6 refuses
 * to default those because a wrong one silently spams a database or silently
 * hides a buyer — invisible either way. This number decides what an OPERATOR is
 * shown. Set it too low and the list is long; too high and it is short. Both
 * are visible in the first second of looking at the screen, and neither reaches
 * a single lead. Different blast radius, different treatment — stated here so
 * the inconsistency is a decision rather than an oversight.
 */
export const DEFAULT_SILENCE_DAYS = 90

const DAY = 1000 * 60 * 60 * 24

function latest(...iso: (string | null)[]): string | null {
  const times = iso
    .filter((s): s is string => Boolean(s))
    .map((s) => [s, new Date(s).getTime()] as const)
    .filter(([, t]) => Number.isFinite(t))
  if (times.length === 0) return null
  return times.sort((a, b) => b[1] - a[1])[0][0]
}

export function findSilence(
  leads: SilenceInput[],
  opts: { now?: Date; thresholdDays?: number } = {},
): Silence {
  const now = (opts.now ?? new Date()).getTime()
  const thresholdDays = opts.thresholdDays ?? DEFAULT_SILENCE_DAYS

  const silent: SilentLead[] = []
  let unknownClock = 0
  let recentlySpoken = 0
  let saidNothing = 0

  for (const l of leads) {
    if (!l.requirementSources.some((s) => SPOKEN.includes(s))) { saidNothing += 1; continue }

    const since = latest(l.lastContactAt, l.lastMessageAt)
    if (!since) { unknownClock += 1; continue }

    const days = Math.floor((now - new Date(since).getTime()) / DAY)
    // A future date is not negative silence. It is a clock we cannot trust, and
    // it goes to the unknown count rather than reading as "spoken to recently"
    // — which is the direction that would hide somebody.
    if (days < 0) { unknownClock += 1; continue }
    if (days < thresholdDays) { recentlySpoken += 1; continue }
    silent.push({ leadId: l.leadId, name: l.name, days, since })
  }

  // Longest silence first: the person left alone longest is the one the agency
  // should look at first, and it makes the top of the list the strongest case
  // rather than an arbitrary one.
  silent.sort((a, b) => b.days - a.days || a.leadId.localeCompare(b.leadId))

  return { silent, unknownClock, recentlySpoken, saidNothing, thresholdDays }
}
