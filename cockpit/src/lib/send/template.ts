/**
 * Approved templates: rendering one, and recognising one on the wire.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ NOTHING IN THIS MODULE IS A ROUTE TO SENDING.                           │
 * │                                                                         │
 * │ `render` returns A STRING. Not a permit, not a plan, not anything       │
 * │ `dispatch` accepts. A caller holding a rendered body still has nothing  │
 * │ a send requires, because SendPermit.record takes a gate verdict and the │
 * │ gate does not take a body.                                              │
 * │                                                                         │
 * │ This module imports no dispatcher, no permit and no adapter, and        │
 * │ one-sender.test.ts reads its source to prove it.                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * TWO MATCHERS, ASKING DIFFERENT QUESTIONS, AND CONFLATING THEM WOULD WEAKEN
 * THE ONE THAT MATTERS MOST:
 *
 *   reconciliation  "is this the message I intended to send?"  EXACT body. It
 *                   knows the rendered text character for character, because it
 *                   wrote body_intended before sending. That exactness is the
 *                   only thing standing between a Concierge reply and a false
 *                   record (match.ts).
 *
 *   orphan sweep    "is this one of ours at all?"  SHAPE. There is no send row,
 *                   so the variables are unknown and only the literal segments
 *                   can be compared.
 */

export type Template = {
  approvalId: string
  clientId: string
  name: string
  language: string
  version: number
  body: string
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** `{{1}}`-indexed, one-based, as Meta numbers them. */
export function render(body: string, variables: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => {
    const i = Number(n) - 1
    if (i < 0 || i >= variables.length) {
      throw new Error(
        `render: template uses {{${n}}} and only ${variables.length} variable(s) were supplied. ` +
        'A template rendered with a missing variable would send the placeholder to a real person.',
      )
    }
    return variables[i]
  })
}

/** The variable numbers a body uses, sorted. */
export function variablesIn(body: string): number[] {
  const seen = new Set<number>()
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) seen.add(Number(m[1]))
  return [...seen].sort((a, b) => a - b)
}

/** Meta rejects non-contiguous numbering; the database checks this too. */
export function variablesAreContiguous(body: string): boolean {
  const v = variablesIn(body)
  return v.every((n, i) => n === i + 1)
}

// ---------------------------------------------------------------------------
// The shape matcher, and the refusal it carries
// ---------------------------------------------------------------------------

/**
 * A template whose literal segments are shorter than this compiles to a pattern
 * that matches almost anything, and a vocabulary entry matching everything is
 * WORSE than a missing one: it turns the sweep's output from "clean" into
 * "meaningless" without changing how it reads.
 *
 * Same family as the empty vocabulary and the wrong channel prefix — a check
 * that cannot fail, reporting success.
 */
export const MIN_LITERAL_CHARS = 24

/** A variable's run on the wire. Bounded, and never across a line. */
const VARIABLE_PATTERN = '[^\\n]{0,160}'

export type Compiled =
  | { ok: true; approvalId: string; test: (body: string) => boolean; literalChars: number }
  | { ok: false; approvalId: string; reason: 'too_variable'; literalChars: number; detail: string }

export function compileTemplate(t: Template): Compiled {
  const parts = t.body.split(/\{\{\d+\}\}/)
  const literalChars = parts.reduce((n, p) => n + p.trim().length, 0)

  if (literalChars < MIN_LITERAL_CHARS) {
    return {
      ok: false,
      approvalId: t.approvalId,
      reason: 'too_variable',
      literalChars,
      detail:
        `"${t.name}" (${t.language} v${t.version}) has only ${literalChars} characters of literal text, ` +
        `below the ${MIN_LITERAL_CHARS} needed to recognise it on the wire. The sweep cannot vouch for ` +
        'this template: a pattern this loose would match unrelated messages, and reporting "clean" from ' +
        'it would be worse than reporting nothing.',
    }
  }

  const source = '^' + parts.map(escapeRegExp).join(VARIABLE_PATTERN) + '$'
  const re = new RegExp(source, 'u')
  return {
    ok: true,
    approvalId: t.approvalId,
    literalChars,
    test: (body: string) => re.test(normalise(body)),
  }
}

/**
 * The vocabulary for one client: every recorded template REGARDLESS OF STATUS.
 *
 * Not filtered to `approved`, deliberately. A message sent under a template Meta
 * disabled yesterday is still one of ours, and filtering by status would make
 * every orphan under it invisible — on the check whose whole job is seeing them.
 * The sweep asks "is this one of ours", never "may we send this".
 */
export function buildVocabulary(templates: Template[]): {
  matches: (body: string) => string | null
  usable: number
  refused: Compiled[]
} {
  const compiled = templates.map(compileTemplate)
  const usable = compiled.filter((c): c is Extract<Compiled, { ok: true }> => c.ok)
  const refused = compiled.filter((c) => !c.ok)

  return {
    usable: usable.length,
    refused,
    /** The approval id of the template this body matches, or null. */
    matches(body: string) {
      for (const c of usable) if (c.test(body)) return c.approvalId
      return null
    },
  }
}

/** NFC, because the wire may normalise differently from our stored copy. */
function normalise(s: string): string {
  return s.normalize('NFC')
}

function escapeRegExp(s: string): string {
  return normalise(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
