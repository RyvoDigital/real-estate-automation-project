/**
 * The consent declaration's write path, as a pure core. /segmentation rebuild,
 * checkpoint 1 (22 Sep 2026): the only screen that writes a declaration, so the
 * most compliance-sensitive write left in the cockpit.
 *
 * PURE: the store, the clock and the id are passed in (`DeclareDeps`), so every
 * path below is a test with fakes (tests/segmentation-declare-core.test.ts).
 * declare.ts supplies the real ones; actions.ts only parses the form into
 * `DeclarationForm` and calls `resolveDeclaration` then `declareSegment`.
 *
 *   🔒 APPEND-ONLY, AND STRUCTURALLY SO. The store this core is given can only
 *      INSERT: `DeclareDeps` has no update, upsert or delete, so a correction
 *      can only ever be a new event. The database says the same thing twice
 *      (the consent_events_no_update and _no_truncate triggers refuse UPDATE,
 *      DELETE and TRUNCATE), and a repo-wide test refuses any code that tries.
 *   🔒 NOTHING HALF-WRITTEN. Every row of one declaration goes in ONE insert,
 *      which PostgREST runs as a single INSERT statement: all rows or none.
 *      Until 22 Sep 2026 the rows went in slices of 200, one request each, so
 *      a failure on the second slice left the first 200 declared — a group
 *      declaration recorded for part of the group, with nothing saying so.
 *   🔒 NEVER PRE-FILLED, NEVER DEFAULTED. The origin is whatever the person
 *      chose, exactly: absent, empty or anything but A–D is a refusal, never a
 *      fallback, and the group's own `proposal` is not an input here at all, so
 *      it cannot become the answer. The declarer's name is typed, never
 *      supplied. Whether they were unsure is a required boolean.
 *   🔒 WHAT WAS DECLARED IS WHAT WAS ON THE SCREEN. The contacts come from the
 *      server's own reading of the group, and must equal the ones the form was
 *      drawn with: a group that changed in between (a new import) is refused
 *      rather than declared for people nobody saw. The group's label is the
 *      server's, never the form's.
 *   🔒 THE AGENCY DECLARES, WE RECORD (unchanged, see declare.ts): declared_by
 *      is their person, evidence.recorded_by is the signed-in operator.
 *   🔒 ONCE, WHATEVER THE RESUBMISSION (checkpoint 2, migration 0055). The form
 *      is drawn with a declaration id; every row carries it in
 *      consent_events.declaration_id. The same form submitted again is refused
 *      by the unique index as ONE statement, and reported as "already
 *      recorded": not a failure, and not a second act. A new form is a new id.
 */

import type { Segment } from '@/lib/segmentation/declare-types'
import type { Refusal } from '@/lib/refusals'
import type { DeclarationRefusalKey } from '@/lib/segmentation/copy'

/** What this core refuses: a KEY, said in the agency's language by the screen (lib/refusals.ts). */
export type DeclarationRefusal = Refusal<DeclarationRefusalKey>

export type DeclareInput = {
  clientId: string
  /** One row per contact, even when declared as a group. */
  contacts: Array<{ phone: string; leadId?: string | null }>
  segment: Segment
  /** The agency's person, by name. 0024 refuses the row without it. */
  declaredBy: string
  /** Us. Never conflated with the above. */
  recordedBy: string
  /** What they said is behind it, in their words. */
  basis?: string | null
  /** 🔒 Required: whether the honest answer was "I do not know". Never assumed. */
  uncertainty: boolean
  /** 🔒 The act's id, minted when the form was DRAWN (never here): the same form resubmitted carries the same one. */
  declarationId: string
  /**
   * Set when this was one action over many contacts. Recorded rather than
   * hidden: a bulk declaration is legitimate AND is a different kind of
   * statement, made with less information per contact.
   */
  group?: { id: string; label: string; size: number } | null
}

export type DeclareResult =
  | { ok: true; written: number; declarationId: string; alreadyRecorded: false }
  /** the same form again: nothing written, and nothing wrong */
  | { ok: true; written: 0; declarationId: string; alreadyRecorded: true }
  | { ok: false; refusal: DeclarationRefusal }

/** 0055's index. tests/segmentation-declare-core.test.ts reads the migration to hold this name to it. */
export const ONE_DECLARATION_INDEX = 'consent_events_one_row_per_declaration_and_contact'

/** One consent_events row, as this core writes it. */
export type DeclarationRow = {
  client_id: string
  phone_e164: string
  lead_id: string | null
  kind: 'declared'
  occurred_at: string
  segment: Segment
  source: 'agency_attestation'
  wording: string | null
  declared_by: string
  /** 0055: every row of one act carries the same id; the index refuses the act twice */
  declaration_id: string
  evidence: {
    recorded_by: string
    declared_as_group: { id: string; label: string; size: number } | null
    uncertainty: boolean
  }
  note: string
}

export type DeclareDeps = {
  /** 🔒 INSERT ONLY, all rows in one statement: every row lands, or none does. */
  insertAll(rows: DeclarationRow[]): Promise<{ error: { code: string | null; message: string } | null }>
  now(): Date
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SEGMENTS: readonly Segment[] = ['A', 'B', 'C', 'D']

/** Pure, so every refusal below is a test with no database. */
export function validateDeclaration(input: DeclareInput): DeclarationRefusal | null {
  if (!input.declaredBy?.trim()) return { key: 'noDeclarer' }
  if (input.declaredBy.trim() === input.recordedBy?.trim()) return { key: 'sameAsRecorder', params: { name: input.declaredBy.trim() } }
  // E is the consequence of an objection and comes from the CONTACT. An agency
  // that could assign it could also remove it.
  if (!SEGMENTS.includes(input.segment)) return { key: 'notDeclarable', params: { value: String(input.segment) } }
  if (!UUID.test(input.declarationId ?? '')) return { key: 'noId' }
  if (typeof input.uncertainty !== 'boolean') return { key: 'unsureUnanswered' }
  if (input.contacts.length === 0) return { key: 'noContacts' }
  // A group declaration records how many it covered; the two must agree or the
  // record misstates what was in front of the person when they said it.
  if (input.group && input.group.size !== input.contacts.length) {
    return { key: 'sizeMismatch', params: { size: String(input.group.size), given: String(input.contacts.length) } }
  }
  // B is the one segment that claims evidence exists. A claim with no
  // description of the evidence is exactly the cell we spent the week undoing.
  if (input.segment === 'B' && !input.basis?.trim()) return { key: 'basisNeeded' }
  return null
}

/** The rows one declaration writes. Pure: the clock and the id come in. */
export function buildRows(input: DeclareInput, now: Date): DeclarationRow[] {
  const at = now.toISOString()
  return input.contacts.map((c) => ({
    client_id: input.clientId,
    phone_e164: c.phone,
    lead_id: c.leadId ?? null,
    kind: 'declared',
    // When the act happened: the agency said it now. Unlike a consent, which
    // happened at some earlier moment we may not know, a declaration IS the
    // moment it is made.
    occurred_at: at,
    segment: input.segment,
    source: 'agency_attestation',
    // Their words, kept verbatim. The wording is the evidence (§5.2).
    wording: input.basis?.trim() || null,
    declared_by: input.declaredBy.trim(),
    declaration_id: input.declarationId,
    evidence: {
      recorded_by: input.recordedBy,
      declared_as_group: input.group ?? null,
      uncertainty: input.uncertainty,
    },
    note: input.group
      ? `Declarado em grupo: ${input.group.label} (${input.group.size} contactos).`
      : 'Declarado contacto a contacto.',
  }))
}

/** Validate, build, and write every row in ONE insert. A refusal or a failure writes nothing. */
export async function declareSegment(input: DeclareInput, deps: DeclareDeps): Promise<DeclareResult> {
  const problem = validateDeclaration(input)
  if (problem) return { ok: false, refusal: problem }
  const rows = buildRows(input, deps.now())
  const { error } = await deps.insertAll(rows)
  const declarationId = input.declarationId
  if (error && error.code === '23505' && error.message.includes(ONE_DECLARATION_INDEX)) {
    // The same form, again: the first submit is the record. Nothing new was written.
    return { ok: true, written: 0, declarationId, alreadyRecorded: true }
  }
  // The database's own text never reaches an agency: its code does, in their language.
  if (error) return { ok: false, refusal: { key: 'dbRefused', params: { code: error.code ?? '?' } } }
  return { ok: true, written: rows.length, declarationId, alreadyRecorded: false }
}

// ── from the form to an input: the server's reading, never the browser's ─────

/** The form, as the action reads it. Every field is exactly what was submitted. */
export type DeclarationForm = {
  clientId: string
  groupId: string
  /** the chosen origin, as submitted: anything but exactly A–D is a refusal */
  segment: string | null
  declaredBy: string | null
  basis: string | null
  /** 🔒 The explicit answer, 'sure' or 'unsure', from two radios nobody pre-selects. Anything else is unanswered. */
  uncertainty: string | null
  /** minted when the form was drawn */
  declarationId: string | null
  /** the contact ids the form was drawn with */
  contacts: string[]
  /** the contact ids the person took out */
  excluded: string[]
}

/** What the server reads for the group: its members and label, as the screen proposed them. */
export type ServerGroup = { id: string; label: string; contactIds: string[] }
export type ServerContact = { id: string; phone: string }

export const UNANSWERED_SURE: DeclarationRefusal = { key: 'unsureUnanswered' }
export const UNCHOSEN: DeclarationRefusal = { key: 'unchosen' }
export const NONE_LEFT: DeclarationRefusal = { key: 'noneLeft' }
export const GROUP_CHANGED: DeclarationRefusal = { key: 'groupChanged' }
export const GROUP_GONE: DeclarationRefusal = { key: 'groupGone' }

export function resolveDeclaration(
  form: DeclarationForm,
  server: { groups: ServerGroup[]; contacts: ServerContact[] },
  recordedBy: string,
): { ok: true; input: DeclareInput } | { ok: false; refusal: DeclarationRefusal } {
  const segment = form.segment
  if (segment === null || !(SEGMENTS as readonly string[]).includes(segment)) {
    return { ok: false, refusal: segment ? { key: 'notDeclarable', params: { value: segment } } : UNCHOSEN }
  }
  if (form.uncertainty !== 'sure' && form.uncertainty !== 'unsure') return { ok: false, refusal: UNANSWERED_SURE }
  const group = server.groups.find((g) => g.id === form.groupId)
  if (!group) return { ok: false, refusal: GROUP_GONE }

  // What the form was drawn with must be exactly the group as the server reads it now.
  const drawn = new Set(form.contacts)
  const now = new Set(group.contactIds)
  if (drawn.size !== now.size || [...drawn].some((id) => !now.has(id))) return { ok: false, refusal: GROUP_CHANGED }

  const excluded = new Set(form.excluded)
  if ([...excluded].some((id) => !now.has(id))) return { ok: false, refusal: GROUP_CHANGED }

  const byId = new Map(server.contacts.map((c) => [c.id, c]))
  const chosen = group.contactIds.filter((id) => !excluded.has(id)).map((id) => byId.get(id))
  if (chosen.some((c) => !c)) return { ok: false, refusal: GROUP_CHANGED }
  if (chosen.length === 0) return { ok: false, refusal: NONE_LEFT }

  return {
    ok: true,
    input: {
      clientId: form.clientId,
      contacts: chosen.map((c) => ({ phone: c!.phone, leadId: c!.id })),
      segment: segment as Segment,
      declaredBy: (form.declaredBy ?? '').trim(),
      recordedBy,
      basis: form.basis?.trim() || null,
      uncertainty: form.uncertainty === 'unsure',
      declarationId: form.declarationId ?? '',
      group: { id: group.id, label: group.label, size: chosen.length },
    },
  }
}
