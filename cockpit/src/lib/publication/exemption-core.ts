/**
 * Declaring a property exempt from certification, as a pure core. The listing
 * screens, checkpoint 1 (22 Sep 2026).
 *
 * PURE: the one store verb is passed in (`ExemptionDeps`); tests/listing-acts-core.test.ts
 * drives every path with fakes. exemption-actions.ts supplies record_exemption
 * (0057) and only parses the form.
 *
 *   🔒 THE ACT IS KEPT. Each declaration is an exemption_records row (0057,
 *      append-only); the current value in listing_facts and the event are written
 *      in the SAME transaction. Until 22 Sep 2026 the only history was an events
 *      row nobody checked had been written, in a table that allows edits.
 *   🔒 "ALREADY RATED" IS DECIDED UNDER THE LOCK (RY001), not read first and
 *      written later.
 *   🔒 THE AGENCY DECLARES, WE RECORD: their person typed; the recorder is the
 *      session. Neither our email nor our name may be the declarer.
 *   🔒 ONCE: the id is minted when the form is drawn; the same form again is
 *      "already recorded". NOTHING THROWS: every outcome is a sentence.
 *   🔒 ERRORS ARE MAPPED BY CONSTRAINT NAME (operator, 22 Sep 2026). Only the
 *      form's OWN key (exemption_records_pkey) means "already recorded". Two
 *      DIFFERENT forms racing on a property with no fact yet: the loser hits
 *      listing_facts_current, which means "someone else just recorded this",
 *      named when the name can be read.
 */
import { validateExemption } from './exemption'
import type { SaveRefusal } from '@/lib/matching/screen-copy'
import { operatorName } from '@/lib/operators'

export type ExemptionForm = {
  exemptionId: string | null
  listingId: string
  requirementId: string | null
  declaredBy: string | null
  basis: string | null
}

export type ActResult =
  | { ok: true; alreadyRecorded: false }
  | { ok: true; alreadyRecorded: true }
  | { ok: false; refusal: SaveRefusal }

export type RpcError = { code: string | null; message: string }

export type ExemptionDeps = {
  /** who declared the CURRENT exemption for this requirement, for the race's sentence; null = none or unreadable */
  currentDeclarer(listingId: string, requirementId: string): Promise<string | null>
  /** 🔒 THE ONE VERB: record_exemption (0057) — the act, the current value and the event, or none. */
  record(args: {
    p_exemption_id: string; p_listing_id: string; p_requirement_id: string
    p_declared_by: string; p_recorded_by: string; p_basis: string
  }): Promise<{ error: RpcError | null }>
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const NO_ID: SaveRefusal = { key: 'exemption.noId' }
export const NO_REQUIREMENT: SaveRefusal = { key: 'exemption.noRequirement' }
export const ONE_EXEMPTION_KEY = 'exemption_records_pkey'
/** 0030's one-current-fact rule: what a racing second form hits when no fact existed */
export const ONE_CURRENT_FACT = 'listing_facts_current'
export const justDeclared = (who: string | null): SaveRefusal =>
  who ? { key: 'exemption.justDeclared', params: { name: who } } : { key: 'exemption.justDeclaredUnknown' }

/** The recorder's email or name typed as the agency's person is us declaring for them. */
export function isUs(name: string, recordedBy: string): boolean {
  const n = name.trim().toLowerCase()
  return [recordedBy, operatorName(recordedBy)].filter(Boolean).some((x) => x!.trim().toLowerCase() === n)
}

export async function recordExemptionAct(form: ExemptionForm, recordedBy: string, deps: ExemptionDeps): Promise<ActResult> {
  if (!UUID.test(form.exemptionId ?? '')) return { ok: false, refusal: NO_ID }
  if (!(form.requirementId ?? '').trim()) return { ok: false, refusal: NO_REQUIREMENT }
  const declaredBy = (form.declaredBy ?? '').trim()
  const basis = (form.basis ?? '').trim()
  // "Already rated" is decided by the database under a lock (RY001), never here from a read.
  const problem = validateExemption({ listingId: form.listingId, basis, declaredBy, recordedBy, alreadyRated: false })
  if (problem) return { ok: false, refusal: problem }
  if (isUs(declaredBy, recordedBy)) return { ok: false, refusal: { key: 'exemption.sameAsRecorder', params: { name: declaredBy } } }

  const { error } = await deps.record({
    p_exemption_id: form.exemptionId!, p_listing_id: form.listingId, p_requirement_id: form.requirementId!.trim(),
    p_declared_by: declaredBy, p_recorded_by: recordedBy.trim(), p_basis: basis,
  })
  if (error?.code === '23505' && error.message.includes(ONE_EXEMPTION_KEY)) return { ok: true, alreadyRecorded: true }
  if (error?.code === '23505' && error.message.includes(ONE_CURRENT_FACT)) {
    return { ok: false, refusal: justDeclared(await deps.currentDeclarer(form.listingId, form.requirementId!.trim()).catch(() => null)) }
  }
  if (error?.code === 'RY001') return { ok: false, refusal: { key: 'exemption.alreadyRated' } }
  // The database's own text never reaches an agency: its code does, in their language.
  if (error) return { ok: false, refusal: { key: 'exemption.dbRefused', params: { code: error.code ?? '?' } } }
  return { ok: true, alreadyRecorded: false }
}
