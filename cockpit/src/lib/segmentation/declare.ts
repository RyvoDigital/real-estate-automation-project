import 'server-only'

import { admin } from '@/lib/supabase/admin'

/**
 * Writing a declaration.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE AGENCY DECLARES. WE RECORD. THEY ARE DIFFERENT PEOPLE AND THE ROW   │
 * │ SAYS SO.                                                                │
 * │                                                                         │
 * │   declared_by            the person AT THE AGENCY who knows             │
 * │   evidence.recorded_by   the operator holding the pen                   │
 * │                                                                         │
 * │ Merging them is the simplification somebody will propose — in the       │
 * │ meeting it IS one laptop with one operator driving — and it would put   │
 * │ OUR name on THEIR assertion. If a supervisory authority asks who said   │
 * │ these were past clients, the answer must be the person who KNEW, not    │
 * │ the person who typed. 0024 makes the author structural; this keeps the  │
 * │ two apart.                                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Nothing here can send: it writes consent_events and reads nothing else. No
 * gate, no permit, no adapter.
 */

export type { Segment } from '@/lib/segmentation/declare-types'
import type { Segment } from '@/lib/segmentation/declare-types'

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
  /** True when the honest answer was "I do not know". */
  uncertainty?: boolean
  /**
   * Set when this was one action over many contacts. Recorded rather than
   * hidden: a bulk declaration is legitimate AND is a different kind of
   * statement, made with less information per contact.
   */
  group?: { id: string; label: string; size: number } | null
}

export type DeclareResult =
  | { ok: true; written: number }
  | { ok: false; reason: string }

export async function declareSegment(input: DeclareInput): Promise<DeclareResult> {
  const problem = validateDeclaration(input)
  if (problem) return { ok: false, reason: problem }

  const now = new Date().toISOString()
  const rows = input.contacts.map((c) => ({
    client_id: input.clientId,
    phone_e164: c.phone,
    lead_id: c.leadId ?? null,
    kind: 'declared',
    // When the act happened: the agency said it now. Unlike a consent, which
    // happened at some earlier moment we may not know, a declaration IS the
    // moment it is made.
    occurred_at: now,
    segment: input.segment,
    source: 'agency_attestation',
    // Their words, kept verbatim. The wording is the evidence (§5.2).
    wording: input.basis ?? null,
    declared_by: input.declaredBy,
    evidence: {
      recorded_by: input.recordedBy,
      declared_as_group: input.group ?? null,
      uncertainty: input.uncertainty === true,
    },
    note: input.group
      ? `Declarado em grupo: ${input.group.label} (${input.group.size} contactos).`
      : 'Declarado contacto a contacto.',
  }))

  let written = 0
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200)
    const { error } = await admin().from('consent_events').insert(slice)
    if (error) return { ok: false, reason: `the database refused the declaration: ${error.message}` }
    written += slice.length
  }
  return { ok: true, written }
}

/** Pure, so every refusal below is a test with no database. */
export function validateDeclaration(input: DeclareInput): string | null {
  if (!input.declaredBy?.trim()) {
    return (
      'A declaration needs the name of the person at the agency who made it. ' +
      'Not the operator recording it: responsibility follows knowledge, and 0024 refuses the row.'
    )
  }
  if (input.declaredBy.trim() === input.recordedBy?.trim()) {
    return (
      `"${input.declaredBy}" is both the declarer and the recorder. The agency declares and we ` +
      'record; if they are the same person the row claims we knew where these contacts came from.'
    )
  }
  if (!['A', 'B', 'C', 'D'].includes(input.segment)) {
    // E is the consequence of an objection and comes from the CONTACT. An
    // agency that could assign it could also remove it.
    return `"${input.segment}" is not something an agency may declare.`
  }
  if (input.contacts.length === 0) return 'No contacts to declare.'
  if (input.group && input.group.size !== input.contacts.length) {
    return (
      `The group says ${input.group.size} contacts and ${input.contacts.length} were supplied. ` +
      'A group declaration records how many it covered; the two must agree or the record misstates ' +
      'what was in front of the person when they said it.'
    )
  }
  if (input.segment === 'B' && !input.basis?.trim()) {
    // B is the one segment that claims evidence exists. A claim with no
    // description of the evidence is exactly the cell we spent the week
    // undoing.
    return (
      'Declaring that authorisation exists needs a description of where it is — which form, which ' +
      'system, what date. Without it the declaration is another unevidenced claim, which is the ' +
      'thing this screen exists to stop repeating.'
    )
  }
  return null
}
