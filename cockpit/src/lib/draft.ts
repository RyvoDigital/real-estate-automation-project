/**
 * Guards for the draft-reply assistant (§7).
 *
 * No React, no `server-only`, no network — so every rule here is directly
 * unit-testable. That matters more than usual: §7's constraints are the kind
 * that a system prompt holds *most* of the time, and the lessons file is
 * explicit that most of the time is not a control.
 *
 *   A probe measures how often the model behaves. A guard determines what
 *   the system is allowed to do. For a rule that must never break, only the
 *   second one is a control.  (engineering-lessons.md §1, #11)
 *
 * So the prompt asks, and these functions decide. A draft that trips a guard
 * is REPLACED by the client's own handoff note rather than edited: cutting a
 * sentence out of a reply leaves a plausible-looking remainder, and a
 * plausible-looking remainder is exactly what nobody re-reads.
 */

export type DraftSource = 'model' | 'fixed'

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: string; detail: string }

/**
 * Times and dates. The Concierge's own rule is that the WORKFLOW chooses
 * slots and the model only phrases them — a confirmation has to be matched
 * later against exactly what was offered, so the offer must be something the
 * workflow knows.
 *
 * The draft assistant is given NO slots at all. So this is stricter than the
 * Concierge's guard rather than a copy of it: there is no supplied list to
 * check against, which means ANY specific time is invented by definition.
 */
/**
 * A word boundary that understands accents.
 *
 * `\b` in JavaScript is ASCII-only: it treats `à`, `ã`, `ç` and `ñ` as
 * NON-word characters. So `/\bàs\b/` never matches "e às 15 horas", and
 * `/\bamanhã\b/` never matches "amanhã?" — because the boundary is being
 * asked for on the wrong side of a character it does not consider a letter.
 *
 * Those are exactly the characters that carry the signal in Portuguese and
 * Spanish, so the naive version of this guard silently missed the two
 * languages it most needed to catch. Unicode property escapes, with the `u`
 * flag, are the fix.
 */
const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'
const w = (body: string, flags = 'iu') => new RegExp(B + body + E, flags)

const TIME_PATTERNS: { rx: RegExp; what: string }[] = [
  { rx: w('([01]?\\d|2[0-3])[:h][0-5]\\d'), what: 'a clock time' },
  { rx: w('(?:às|as|at|a\\s+las)\\s+([01]?\\d|2[0-3])'), what: 'an hour' },
  { rx: w('\\d{1,2}\\s*(?:am|pm)'), what: 'an am/pm time' },
  {
    rx: w(
      '(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|' +
        'monday|tuesday|wednesday|thursday|friday|saturday|sunday|' +
        'lunes|martes|miércoles|miercoles|jueves|viernes)',
    ),
    what: 'a weekday',
  },
  {
    rx: w('(?:amanhã|amanha|hoje|tomorrow|today|mañana|manana|hoy)'),
    what: 'a relative day',
  },
  {
    rx: w(
      '\\d{1,2}\\s+de\\s+(?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|' +
        'agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|mayo|junio|' +
        'julio|septiembre|octubre|noviembre|diciembre)',
    ),
    what: 'a date',
  },
]

/**
 * Money. The draft must never invent a price, and must never counter one.
 * Any figure that is not already in the conversation is invented — so the
 * check is not "does it mention money" but "does it mention money the lead
 * has not already said".
 */
/*
 * ⚠️ A SINGLE-DIGIT MILLIONS FIGURE WAS INVISIBLE TO THIS GUARD.
 *
 * The magnitude branch required `[\d.,]{3,}` — at least three characters before
 * the unit — so "4 milhões" and "2 milhões" matched NOTHING and the guard
 * returned ok with an EMPTY known set. A model-written draft could invent
 * "dois milhões" and the cockpit's draft assistant (actions.ts) would pass it
 * straight through. "1.5 milhões" was caught; "2 milhões" was not, which is the
 * worst shape for a gap: it looks like it works whenever you test it with a
 * realistic-looking number.
 *
 * Found on 2026-09-18 by a test I had PREDICTED would pass for a different
 * reason. The prediction was that a bedroom count of 4 in the known set was
 * licensing "4 milhões"; investigating instead of explaining showed the guard
 * never saw the figure at all, and that the real defect was larger and had
 * nothing to do with the widened set (lesson 1k).
 *
 * The vocabulary is also aligned with the extractor's, which reads the same
 * market's money: `milhão`, `milhao`, `milhoes`, `million` and `millón` were
 * all absent here while present there. Two readers of one convention drifting
 * is lesson 15.
 */
const MONEY = /(?:€|eur\b|euros?\b)\s*[\d.,]+|\b[\d.,]+\s*(?:€|eur\b|euros?\b|k\b|mil\b|milh[õo]es|milh[ãa]o|million|mill[óo]n|millones)/gi

function digitsOf(s: string): Set<string> {
  return new Set((s.match(/\d[\d.,]*/g) ?? []).map((d) => d.replace(/[.,]/g, '')))
}

/**
 * Does this draft do any of the three things §7 forbids?
 *
 * `conversation` is every message already exchanged. A figure the LEAD has
 * already used is quotable back at them; one that appears from nowhere is
 * the model inventing.
 */
/**
 * THE ONE LISTING FACT A DRAFT MAY STATE AS MONEY: ITS ASKING PRICE.
 *
 * A 03 draft's most important figure is the price, which is in the listing and
 * not in the conversation — so without this the guard refuses the CORRECT
 * draft. Widening it is also exactly how an invented figure gets through, so
 * the set is one field and the reason is measured rather than reasoned:
 *
 *   with size_sqm 320 in the known set —
 *     "Consigo por 320 mil."     -> PASSED   (€320,000, from a floor area)
 *
 * (A bedroom count of 4 appeared to license "4 milhões" too. It did not: the
 * money pattern could not see a single-digit millions figure at all, which was
 * a separate and larger defect — see the MONEY comment below.)
 *
 * `MONEY` matches a bare digit run before `mil`, and the comparison strips
 * separators, so a non-money field is indistinguishable from a price once it is
 * in the set. "The listing's stored fields" is already too wide.
 *
 * NOTHING DERIVED, either: no stretch ceiling, no price per square metre, no
 * difference from the lead's budget, no rounded form. Each of those is a number
 * we computed rather than a number that is true of the property.
 */
export function knownFigures(listing: { price: number | null } | null): string[] {
  return listing?.price == null ? [] : [String(listing.price)]
}

export function guardDraft(
  draft: string,
  conversation: string,
  listing?: { price: number | null } | null,
): GuardResult {
  const text = draft.trim()
  if (!text) return { ok: false, reason: 'empty', detail: 'the model returned nothing' }

  for (const { rx, what } of TIME_PATTERNS) {
    const m = text.match(rx)
    if (m) {
      return {
        ok: false,
        reason: 'proposed_a_time',
        detail:
          `the draft named ${what} ("${m[0]}"). The workflow owns slots — a ` +
          `confirmation has to be matched against exactly what was offered, and ` +
          `nothing was offered here.`,
      }
    }
  }

  const known = digitsOf(conversation)
  for (const f of knownFigures(listing ?? null)) known.add(f)
  for (const hit of text.match(MONEY) ?? []) {
    const n = (hit.match(/\d[\d.,]*/) ?? [''])[0].replace(/[.,]/g, '')
    if (n && !known.has(n)) {
      return {
        ok: false,
        reason: 'invented_a_figure',
        detail:
          `the draft used "${hit.trim()}", which is neither in the conversation nor the ` +
          'listing\'s asking price. A figure stated in a form we do not hold is refused ' +
          'too: the price must appear as we hold it, because normalising representations ' +
          'is how two numbers start being treated as one fact.',
      }
    }
  }

  return { ok: true }
}

/**
 * Reasons the model must not be asked for a free reply AT ALL.
 *
 * §7: "A lead escalated for price negotiation is the most likely draft
 * request, and it is exactly where the model must not draft a negotiating
 * position." The strongest form of that is not a better prompt and not a
 * cleverer guard — it is never giving the model the opportunity. When this
 * returns a reason, no model call is made.
 */
const NEGOTIATION_WORDS =
  /(?<![\p{L}])(?:negocia|negotia|desconto|descuento|discount|baixar|bajar|(?:better|lower|best|good)\s+(?:price|offer|deal)|melhor\s+pre|mejor\s+pre|oferta|offer|proposta|propuesta|contra-?proposta|margem|margen|margin|regatear|haggl)/iu

export function mustUseFixedReply(
  reasons: string[],
  conversation: string,
): { fixed: true; why: string } | { fixed: false } {
  if (reasons.some((r) => r.startsWith('high_value'))) {
    return {
      fixed: true,
      why:
        'this lead was escalated as high value, which is where a drafted ' +
        'negotiating position would do the most damage',
    }
  }
  if (NEGOTIATION_WORDS.test(conversation)) {
    return {
      fixed: true,
      why: 'the conversation is about price or terms, which the assistant must not draft a position on',
    }
  }
  return { fixed: false }
}

/**
 * The fallback, in the lead's language, from the client's own config.
 *
 * Deliberately the SAME strings the Concierge sends when it fails. They were
 * written by a human, they are already the client's voice, and reusing them
 * means there is no second set of copy to drift.
 */
export function fixedReply(
  handoff: Record<string, string> | undefined,
  language: string,
  fallbackLanguage: string,
): string | null {
  if (!handoff) return null
  return handoff[language] || handoff[fallbackLanguage] || null
}
