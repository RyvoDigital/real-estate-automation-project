/**
 * Recording what onboarding proved or did: the routing proof and the
 * AI-disclosure conversation (0054, onboarding_records). /onboarding checkpoint 2.
 *
 * PURE: parsing, validation, and a save core handed its database and its
 * revalidation, so both are tested with fakes (tests/onboarding-record.test.ts)
 * and nothing here reaches production by itself. lib/onboarding-actions.ts is
 * the thin server-action wrapper, as lib/month/actions.ts is for The Month.
 *
 *   🔴 The routing proof has BOTH halves or it is not recorded: this client's
 *      number answered as this client, AND an existing client's number still
 *      answered as itself (brief §2.8). Both are explicit ticks, never implied.
 *   🔒 A day that has not happened yet is refused: a record says what happened.
 *   🔒 Until 0054 is applied there is nowhere to write, and the form says so
 *      rather than failing at the database.
 *   🔒 Append-only (0054): a correction is a new record; nothing here edits one.
 */

export type RecordKind = 'routing' | 'disclosure'
export type RecordResult = { ok: boolean; message: string; values: Record<string, string>; errors: Record<string, string> }
export const RECORD_EMPTY: RecordResult = { ok: true, message: '', values: {}, errors: {} }

const FIELDS: Record<RecordKind, string[]> = {
  routing: ['happened_on', 'existing_client_id', 'new_answered', 'existing_answered'],
  disclosure: ['happened_on', 'told'],
}

const isDate = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
const trim = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '')

export type RecordContext = {
  clientId: string
  /** the client's creation day: nothing about it can have happened before */
  createdOn: string
  /** today, in Lisbon */
  today: string
  /** the clients a routing proof's other half may name: every OTHER client, gate clients excluded */
  otherClientIds: string[]
}

type Row = Record<string, unknown>
export type Validated = { ok: true; row: Row } | { ok: false; errors: Record<string, string> }

export function validateRecord(kind: RecordKind, v: Record<string, string>, recordedBy: string, ctx: RecordContext): Validated {
  const e: Record<string, string> = {}
  if (!isDate(v.happened_on)) e.happened_on = 'The day it happened.'
  else if (v.happened_on > ctx.today) e.happened_on = 'That day has not happened yet: a record says what happened.'
  else if (v.happened_on < ctx.createdOn) e.happened_on = `Before this client existed (${ctx.createdOn}).`

  if (kind === 'routing') {
    if (!v.existing_client_id) e.existing_client_id = 'Which existing client’s number you also messaged.'
    else if (v.existing_client_id === ctx.clientId) e.existing_client_id = 'Another client: the proof is that BOTH still answer as themselves.'
    else if (!ctx.otherClientIds.includes(v.existing_client_id)) e.existing_client_id = 'Not one of the clients that can be checked.'
    if (v.new_answered !== 'yes') e.new_answered = 'Confirm this client’s number answered with this client’s assistant, areas and config.'
    if (v.existing_answered !== 'yes') e.existing_answered = 'Confirm the existing client’s number still answered as itself. Checking only the new one proves nothing.'
    if (Object.keys(e).length) return { ok: false, errors: e }
    return { ok: true, row: {
      client_id: ctx.clientId, step: 'routing_proved', happened_on: v.happened_on, recorded_by: recordedBy,
      detail: { new_client_answered: true, existing_client_answered: true, existing_client_id: v.existing_client_id },
    } }
  }
  if (!v.told) e.told = 'Who at the agency heard it, by name.'
  if (Object.keys(e).length) return { ok: false, errors: e }
  return { ok: true, row: {
    client_id: ctx.clientId, step: 'ai_disclosure_told', happened_on: v.happened_on, recorded_by: recordedBy,
    detail: { told: v.told },
  } }
}

export type RecordDeps = {
  insert(row: Row): Promise<{ error: { message: string } | null }>
  revalidate(path: string): void
  /** false until 0054 is applied */
  recordable: boolean
}

export async function saveRecord(kind: RecordKind, form: FormData, recordedBy: string, ctx: RecordContext, deps: RecordDeps): Promise<RecordResult> {
  const values: Record<string, string> = {}
  for (const k of FIELDS[kind]) values[k] = trim(form.get(k))
  if (!deps.recordable) {
    return { ok: false, message: 'Not recorded: migration 0054 is not applied yet, so there is nowhere to write it.', values, errors: {} }
  }
  const checked = validateRecord(kind, values, recordedBy, ctx)
  if (!checked.ok) return { ok: false, message: 'Not recorded: check the fields marked.', values, errors: checked.errors }
  let error: { message: string } | null
  try { ({ error } = await deps.insert(checked.row)) } catch (e) { error = { message: (e as Error).message } }
  if (error) return { ok: false, message: `Not recorded: the database refused it: ${error.message}`, values, errors: {} }
  deps.revalidate('/onboarding')
  return { ok: true, message: kind === 'routing' ? 'Routing proof recorded.' : 'The disclosure conversation is recorded.', values: {}, errors: {} }
}
