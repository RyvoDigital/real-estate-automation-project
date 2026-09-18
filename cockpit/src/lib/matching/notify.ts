import type { MatchRunPlan, MatchRunRefusal } from './run'
import { renderReasons, type Lang, type Reason } from './reason'

/**
 * What the agent is told when a listing arrives.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ COMPOSED, NEVER GENERATED.                                              │
 * │                                                                         │
 * │ Every sentence here is assembled from the match reasoning by this       │
 * │ function. No model writes any of it. The notification asserts facts     │
 * │ about named real people — what they asked for, when they were last      │
 * │ spoken to — and the agent repeats those facts to the lead in their own  │
 * │ voice. §0 of the lessons file is a generated message asserting          │
 * │ something untrue, reaching a person who then acts on it.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THIS NEEDS NO TEMPLATE, NO GATE AND NO META APPROVAL
 * ───────────────────────────────────────────────────────────────────────────
 * The listing arrives BECAUSE THE AGENT SENT IT. That inbound message opens a
 * 24-hour customer-service window on the client's number, and the Concierge
 * already replies free-form inside it — `ReplyToAgent` has been live since F2.
 * So this text is appended to a reply that already happens, seconds after the
 * agent's own message.
 *
 * Which means: no approved template, no variable limits, no submission, and no
 * gate — the gate governs business-INITIATED messages, and this is a reply
 * inside a window the recipient opened. It is also why 03's primary path has no
 * Meta dependency at all, unlike 02.
 *
 * The cockpit COMPOSES and n8n TRANSMITS, over the reply channel that already
 * exists. Nothing here sends, imports an adapter, or holds a credential.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠️ WHAT A FIXTURE CANNOT VALIDATE, AND IS NOT CLAIMED TO
 * ───────────────────────────────────────────────────────────────────────────
 * The STRUCTURE below is exercised: which blocks appear, what is excluded, what
 * a zero says, that it fits a phone. The WORDING is not, and cannot be, because
 * the gate for F4 is "it reads like something I'd act on rather than delete" and
 * no fixture can answer that. Three things specifically are unvalidated:
 *
 *   1. Whether an agent would act on this at all. Needs a real agent.
 *   2. THE LANGUAGE. `reasons` come from score.ts as English prose — "Cascais
 *      is exactly what they asked for" — and the agency is Portuguese. The
 *      frame here is keyed by language; the reasons are not, because they are
 *      generated one layer down. That is a real seam and it is named rather
 *      than papered over: score.ts must emit structured reasons with a
 *      per-language renderer before a real agent reads one.
 *   3. Length in practice. Six matches with long evidence quotes may be a wall
 *      of text on a phone. The cap below is a guess and is the kind of guess
 *      §4.6 says belongs in config once somebody has seen a real one.
 *
 * None of that blocks building the mechanism. All of it blocks claiming the
 * mechanism reads well.
 */

export type NotifiableMatch = {
  leadId: string
  /** The lead's name. NEVER their phone number — see below. */
  name: string
  /** Whole months since we last spoke, or null if we never have. */
  monthsSinceContact: number | null
  strength: 'strong' | 'possible' | 'weak'
  filterWouldFind: boolean
  /** Structured. Rendered here, in the agent's language, and nowhere earlier. */
  reasons: Reason[]
}

export type ChosenMatch = {
  leadId: string
  name: string
  chosenBy: string
  chosenReason: string | null
}

export type Notification = {
  text: string
  /** For the cockpit, which renders rather than reads a blob. */
  blocks: { kind: 'header' | 'computed' | 'chosen' | 'refusal' | 'nothing' | 'footer'; text: string }[]
  /** Matches named in the text. Fewer than the run found, when capped. */
  named: number
  omitted: number
}

/**
 * How many leads are named before the rest become a count.
 *
 * A guess, stated as one. It is not in `client_automations.config` with the
 * matching thresholds because those decide WHETHER something is a match — a
 * judgement with legal and commercial weight — and this decides how long a
 * WhatsApp message is. When somebody has read a real one on a real phone, it
 * moves to config or it changes; until then a magic number with its reasoning
 * attached beats a config key nobody has an opinion about.
 */
const NAME_AT_MOST = 5

export type Frame = {
  header: (ref: string, area: string, price: string, n: number, strong: number) => string
  strongSuffix: string
  chosenHeader: (n: number) => string
  chosenBy: (who: string) => string
  notContacted: (months: number) => string
  neverContacted: string
  filterWouldNotFind: string
  omitted: (n: number) => string
  nothing: (considered: number, unmatchable: number) => string
  unmatchableNote: (n: number) => string
  refusal: (detail: string) => string
  footer: string
}

/**
 * Fixed strings keyed by language, never model-rendered — the same rule as the
 * Concierge's per-language handoff notes (Checkpoint D2). A frame assembled by
 * a model is a frame that can assert something nobody wrote.
 */
export const FRAMES: Record<'en', Frame> = {
  en: {
    header: (ref, area, price, n, strong) =>
      `${ref} · ${area} · ${price} — ${n} ${n === 1 ? 'contact matches' : 'contacts match'}` +
      (strong > 0 ? `, ${strong} strongly.` : '.'),
    strongSuffix: '',
    chosenHeader: (n) => `${n} you picked yourself:`,
    chosenBy: (who) => `chosen by ${who}`,
    notContacted: (m) => `Not contacted in ${m} ${m === 1 ? 'month' : 'months'}.`,
    neverContacted: 'Never contacted.',
    filterWouldNotFind: 'A filter on their stored fields would not have found this one.',
    omitted: (n) => `And ${n} more — open the cockpit for all of them.`,
    nothing: (considered, unmatchable) =>
      `No contact matches this one. ${considered} considered` +
      (unmatchable > 0
        ? `, and ${unmatchable} of them have nothing on record saying what they want.`
        : '.'),
    unmatchableNote: (n) =>
      `${n} ${n === 1 ? 'contact has' : 'contacts have'} nothing on record saying what they want, ` +
      'so they were not ranked. They are in the cockpit to go through by hand.',
    refusal: (detail) => `I could not match this one.\n\n${detail}`,
    footer: 'Reply 1 for a draft, or open the cockpit.',
  },
}

/**
 * THE PHONE NUMBER IS DELIBERATELY ABSENT.
 *
 * The agent acts in the cockpit or by replying, both of which leave a record. A
 * lead's phone number in a WhatsApp message puts contact data in an agent's
 * personal chat history, forwardable, for no operational gain — and it is the
 * kind of thing that is obvious only after it has happened. Asserted in the
 * tests, not just avoided here.
 */
function leadLine(m: NotifiableMatch, f: Frame, lang: Lang): string {
  const parts = [`*${m.name}* — ${renderReasons(m.reasons, lang).join(' ')}`]
  if (m.monthsSinceContact === null) parts.push(f.neverContacted)
  else if (m.monthsSinceContact > 0) parts.push(f.notContacted(m.monthsSinceContact))
  if (!m.filterWouldFind) parts.push(f.filterWouldNotFind)
  return parts.join(' ')
}

export function composeAgentNotification(input: {
  listing: { reference: string | null; area: string | null; price: number | null }
  plan: MatchRunPlan
  /** Only for the matches the caller resolved names for, in plan order. */
  matches: NotifiableMatch[]
  chosen: ChosenMatch[]
  language?: 'en'
}): Notification {
  const lang: Lang = 'en'
  const f = FRAMES[input.language ?? 'en']
  const blocks: Notification['blocks'] = []

  const ref = input.listing.reference ?? 'New listing'
  const area = input.listing.area ?? 'area not given'
  const price =
    input.listing.price === null ? 'price not given' : `€${input.listing.price.toLocaleString('en-GB')}`

  /*
   * A REFUSAL IS TOLD TO THE AGENT, NOT SWALLOWED.
   *
   * The same reason the ingest reply exists at all: an agent who sends a
   * listing and hears nothing assumes it landed. "I could not match this one,
   * and here is exactly what is missing" is actionable; silence is indis-
   * tinguishable from "nobody wants it", which is a much worse thing to
   * believe about your own database.
   */
  if (!input.plan.ran) {
    const r: MatchRunRefusal = input.plan.refusal
    blocks.push({ kind: 'refusal', text: f.refusal(r.detail) })
    return { text: blocks.map((b) => b.text).join('\n\n'), blocks, named: 0, omitted: 0 }
  }

  const strong = input.matches.filter((m) => m.strength === 'strong').length
  const total = input.matches.length + input.chosen.length

  if (total === 0) {
    blocks.push({
      kind: 'nothing',
      text:
        `${ref} · ${area} · ${price}\n\n` +
        f.nothing(input.plan.considered, input.plan.unmatchableNoRequirements.length),
    })
    return { text: blocks.map((b) => b.text).join('\n\n'), blocks, named: 0, omitted: 0 }
  }

  blocks.push({ kind: 'header', text: f.header(ref, area, price, total, strong) })

  const named = input.matches.slice(0, NAME_AT_MOST)
  const omitted = input.matches.length - named.length
  for (const m of named) blocks.push({ kind: 'computed', text: leadLine(m, f, lang) })

  /*
   * CHOSEN IS NOT MATCHED, AND THE BLOCKS SAY SO SEPARATELY.
   *
   * 0025 makes the two unmergeable in the database — an agent row carries no
   * score and no `filter_would_find`, by CHECK constraint. This is the same
   * rule at the reading end: a person's pick and a computed match are different
   * kinds of claim, and running them together in one list under one heading
   * would let the weaker one borrow the stronger one's authority.
   */
  if (input.chosen.length > 0) {
    blocks.push({ kind: 'chosen', text: f.chosenHeader(input.chosen.length) })
    for (const c of input.chosen) {
      const why = c.chosenReason ? ` — ${c.chosenReason}` : ''
      blocks.push({ kind: 'chosen', text: `*${c.name}*${why} (${f.chosenBy(c.chosenBy)})` })
    }
  }

  if (omitted > 0) blocks.push({ kind: 'computed', text: f.omitted(omitted) })

  if (input.plan.unmatchableNoRequirements.length > 0) {
    blocks.push({
      kind: 'footer',
      text: f.unmatchableNote(input.plan.unmatchableNoRequirements.length),
    })
  }

  blocks.push({ kind: 'footer', text: f.footer })

  return {
    text: blocks.map((b) => b.text).join('\n\n'),
    blocks,
    named: named.length + input.chosen.length,
    omitted,
  }
}

/**
 * Does this text contain anything that looks like a phone number?
 *
 * The first version stripped every non-digit from the WHOLE text and asked
 * whether nine digits remained — which is true of any notification mentioning
 * two prices, so the guard would have fired on everything and been "fixed" by
 * deleting it. A guard that cannot distinguish its target from its subject is
 * worse than none: it trains people to ignore it.
 *
 * So: a RUN of digits, at least nine of them, not preceded by a currency
 * symbol. €2,200,000 is seven digits and passes; +351912345678 is twelve and
 * does not.
 */
export function containsPhoneNumber(text: string): boolean {
  for (const m of text.matchAll(/(?<![€$£\d.,])\+?\d[\d\s().-]{6,}\d/g)) {
    if (m[0].replace(/\D/g, '').length >= 9) return true
  }
  return false
}
