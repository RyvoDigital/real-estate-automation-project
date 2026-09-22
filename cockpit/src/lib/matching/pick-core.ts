/**
 * The agent's pick ("this contact suits this property"), as a pure core. The
 * listing screens, checkpoint 1 (22 Sep 2026).
 *
 * PURE: the reads and the one store verb are passed in (`PickDeps`);
 * tests/listing-acts-core.test.ts drives every path. triage-actions.ts supplies
 * record_agent_pick (0057) and only parses the form.
 *
 *   🔒 ALL OR NOTHING. The match, the requirements its sentence taught and the
 *      event are ONE transaction (0057). Until 22 Sep 2026 they were three
 *      requests, and the match could land while its reasons did not.
 *   🔒 A CONTACT THE ENGINE ALREADY MATCHED CAN BE CHOSEN: its computed match is
 *      superseded by the pick, instead of the screen throwing on the unique index.
 *   🔒 ONLY THIS AGENCY'S CONTACTS (RY002), and a contact already chosen for this
 *      property is said so by name (RY003).
 *   🔒 THE AGENCY CHOOSES, WE RECORD; neither our email nor our name may be the chooser.
 *   🔒 THE AREAS THE SENTENCE IS READ AGAINST MUST BE READ: a failed read is a
 *      refusal, never an empty list that silently learns nothing.
 *   🔒 ONCE: the id is minted when the form is drawn. NOTHING THROWS.
 *   🔒 ERRORS ARE MAPPED BY CONSTRAINT NAME (operator, 22 Sep 2026). Only the
 *      form's OWN key (listing_matches_pkey) means "already recorded". Two
 *      DIFFERENT forms for the same contact racing: the loser hits the
 *      one-current-match rule (listing_matches_current_uniq), which means
 *      "someone else just chose this contact", named when the name can be read.
 */
import { planPick } from './triage'
import { UUID, isUs, type RpcError } from '@/lib/publication/exemption-core'
import type { SaveRefusal } from '@/lib/matching/screen-copy'

export type PickForm = {
  pickId: string | null
  listingId: string | null
  leadId: string | null
  chosenBy: string | null
  reason: string | null
}

export type PickResult =
  | { ok: true; alreadyRecorded: false; supersededComputed: boolean; learned: number }
  | { ok: true; alreadyRecorded: true }
  | { ok: false; refusal: SaveRefusal }

export type PickDeps = {
  /** the areas this listing's agency's buyers talk about (§4.3); null = the read failed */
  knownAreas(listingId: string): Promise<string[] | null>
  /** who chose the CURRENT match for this pair, for the race's sentence; null = none or unreadable */
  currentChooser(listingId: string, leadId: string): Promise<string | null>
  /** 🔒 THE ONE VERB: record_agent_pick (0057). */
  record(args: {
    p_match_id: string; p_listing_id: string; p_lead_id: string; p_chosen_by: string; p_recorded_by: string
    p_reason: string | null; p_requirements: { kind: string; value: unknown; strength: string; why: string; superseded_by: unknown }[]
  }): Promise<{ data: string | null; error: RpcError | null }>
}

export const NO_ID: SaveRefusal = { key: 'pick.noId' }
export const NO_TARGET: SaveRefusal = { key: 'pick.noTarget' }
export const NO_NAME: SaveRefusal = { key: 'pick.noName' }
export const SAME_PERSON: SaveRefusal = { key: 'pick.samePerson' }
export const AREAS_UNREAD: SaveRefusal = { key: 'pick.areasUnread' }
export const OTHER_AGENCY: SaveRefusal = { key: 'pick.otherAgency' }
export const ONE_PICK_KEY = 'listing_matches_pkey'
/** 0025's one-current-match rule: what a racing second form hits */
export const ONE_CURRENT_MATCH = 'listing_matches_current_uniq'
export const justChosen = (who: string | null): SaveRefusal =>
  who ? { key: 'pick.justChosen', params: { name: who } } : { key: 'pick.justChosenUnknown' }

export async function recordPick(form: PickForm, recordedBy: string, deps: PickDeps): Promise<PickResult> {
  if (!UUID.test(form.pickId ?? '')) return { ok: false, refusal: NO_ID }
  if (!form.listingId || !form.leadId) return { ok: false, refusal: NO_TARGET }
  const chosenBy = (form.chosenBy ?? '').trim()
  if (!chosenBy) return { ok: false, refusal: NO_NAME }
  if (isUs(chosenBy, recordedBy)) return { ok: false, refusal: SAME_PERSON }

  const areas = await deps.knownAreas(form.listingId)
  if (areas === null) return { ok: false, refusal: AREAS_UNREAD }
  const reason = (form.reason ?? '').trim() || null
  const plan = planPick({ reason, knownAreas: areas })

  const { data, error } = await deps.record({
    p_match_id: form.pickId!, p_listing_id: form.listingId, p_lead_id: form.leadId, p_chosen_by: chosenBy,
    p_recorded_by: recordedBy.trim(), p_reason: reason,
    p_requirements: plan.requirements.map((r) => ({ kind: r.kind, value: r.value, strength: r.strength, why: r.why, superseded_by: r.supersededBy ?? null })),
  })
  if (error?.code === '23505' && error.message.includes(ONE_PICK_KEY)) return { ok: true, alreadyRecorded: true }
  if (error?.code === '23505' && error.message.includes(ONE_CURRENT_MATCH)) {
    return { ok: false, refusal: justChosen(await deps.currentChooser(form.listingId, form.leadId).catch(() => null)) }
  }
  if (error?.code === 'RY002') return { ok: false, refusal: OTHER_AGENCY }
  if (error?.code === 'RY003') {
    // Who already chose them, read back: the database's own sentence is English and never reaches an agency.
    const who = await deps.currentChooser(form.listingId, form.leadId).catch(() => null)
    return { ok: false, refusal: who ? { key: 'pick.alreadyChosen', params: { name: who } } : { key: 'pick.alreadyChosenUnknown' } }
  }
  // The database's own text never reaches an agency: its code does, in their language.
  if (error) return { ok: false, refusal: { key: 'pick.dbRefused', params: { code: error.code ?? '?' } } }
  return { ok: true, alreadyRecorded: false, supersededComputed: data === 'superseded_computed', learned: plan.requirements.length }
}
