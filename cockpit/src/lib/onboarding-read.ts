import 'server-only'
import { admin } from '@/lib/supabase/admin'
import { gateClientIds } from '@/lib/gate-clients'
import { lisbonToday } from '@/lib/month/model'
import { checklistFor, type Checklist, type ChecklistInputs } from '@/lib/onboarding-checklist'

/*
 * The reads behind /onboarding (checkpoint 2). Each source fails on its own:
 * a failed read makes ITS step "unknown" (lib/onboarding-checklist.ts), never
 * the page, and never a step that looks done or outstanding.
 *
 *   🔒 Narrow columns. consent_events: client_id and occurred_at of kind
 *      'declared' only, never a phone or a wording. client_automations: the
 *      calibration stamp only.
 *   🔒 The deploy gate's test clients (config.gate_only) are left out of the
 *      list and out of the routing proof's choices: the gate client's number is
 *      not a real inbound route.
 *   🔒 0054 not applied is its own state ('not_migrated'), told apart from a
 *      failed read by the error PostgREST gives for a relation it does not know.
 */

export type ClientRow = { id: string; name: string; rehearsal: boolean; created_at: string }

const MISSING_RELATION = new Set(['PGRST205', '42P01'])

type RecordRow = { client_id: string; step: 'routing_proved' | 'ai_disclosure_told'; happened_on: string; recorded_by: string; detail: Record<string, unknown> }

async function readRecords(ids: string[]): Promise<Map<string, ChecklistInputs['records']> | 'not_migrated' | null> {
  if (!ids.length) return new Map()
  const { data, error } = await admin().from('onboarding_records_current')
    .select('client_id, step, happened_on, recorded_by, detail').in('client_id', ids).order('happened_on')
  if (error) return MISSING_RELATION.has(error.code ?? '') ? 'not_migrated' : null
  const m = new Map<string, ChecklistInputs['records']>(ids.map((id) => [id, []]))
  for (const r of (data ?? []) as RecordRow[]) {
    ;(m.get(r.client_id) as Exclude<ChecklistInputs['records'], null | 'not_migrated'>).push({ step: r.step, happenedOn: r.happened_on, recordedBy: r.recorded_by, detail: r.detail ?? {} })
  }
  return m
}

async function readDeclared(ids: string[]): Promise<Map<string, string> | null> {
  if (!ids.length) return new Map()
  const { data, error } = await admin().from('consent_events').select('client_id, occurred_at')
    .in('client_id', ids).eq('kind', 'declared').order('occurred_at').limit(5000)
  if (error) return null
  const m = new Map<string, string>()
  for (const r of (data ?? []) as { client_id: string; occurred_at: string }[]) if (!m.has(r.client_id)) m.set(r.client_id, lisbonToday(new Date(r.occurred_at)))
  return m
}

async function readCalibrated(ids: string[]): Promise<Map<string, string> | null> {
  if (!ids.length) return new Map()
  const { data, error } = await admin().from('client_automations')
    .select('client_id, config, automations!inner(key)')
    .in('client_id', ids).eq('automations.key', 'lead_nurture')
  if (error) return null
  const m = new Map<string, string>()
  // Only the calibration's stamp is taken from the config; nothing else of it is used.
  for (const r of (data ?? []) as unknown as { client_id: string; config: { calibration?: { recorded_at?: string } } | null }[]) {
    const at = r.config?.calibration?.recorded_at
    if (at) m.set(r.client_id, lisbonToday(new Date(at)))
  }
  return m
}

export type OnboardingIndex = {
  clients: { client: ClientRow; checklist: Checklist }[] | null
  failure: string | null
}

async function readClients(): Promise<{ rows: ClientRow[] | null; gate: string[] }> {
  const gate = await gateClientIds()
  const { data, error } = await admin().from('clients').select('id, name, rehearsal, created_at').order('created_at', { ascending: false })
  if (error) return { rows: null, gate }
  return { rows: ((data ?? []) as ClientRow[]).filter((c) => !gate.includes(c.id)), gate }
}

function inputsFor(c: ClientRow, records: Awaited<ReturnType<typeof readRecords>>, declared: Map<string, string> | null,
                   calibrated: Map<string, string> | null, names: Map<string, string>): ChecklistInputs {
  return {
    client: { id: c.id, name: c.name, rehearsal: c.rehearsal, createdOn: lisbonToday(new Date(c.created_at)) },
    records: records === null ? null : records === 'not_migrated' ? 'not_migrated' : (records.get(c.id) ?? []),
    declaredOn: declared === null ? undefined : (declared.get(c.id) ?? null),
    calibratedOn: calibrated === null ? undefined : (calibrated.get(c.id) ?? null),
    clientNames: names,
  }
}

/** Every client (gate clients excepted), newest first, each with its checklist. */
export async function readOnboardingIndex(): Promise<OnboardingIndex> {
  const { rows } = await readClients()
  if (!rows) return { clients: null, failure: 'The clients could not be read.' }
  const ids = rows.map((c) => c.id)
  const names = new Map(rows.map((c) => [c.id, c.name]))
  const [records, declared, calibrated] = await Promise.all([readRecords(ids), readDeclared(ids), readCalibrated(ids)])
  return { clients: rows.map((c) => ({ client: c, checklist: checklistFor(inputsFor(c, records, declared, calibrated, names)) })), failure: null }
}

export type OnboardingOne = {
  client: ClientRow
  checklist: Checklist
  /** the routing proof's possible other halves: every OTHER client, gate excepted */
  others: { id: string; name: string }[]
  recordable: boolean
  today: string
  createdOn: string
} | null

export async function readOnboardingOne(clientId: string): Promise<OnboardingOne> {
  const { rows } = await readClients()
  const client = rows?.find((c) => c.id === clientId)
  if (!rows || !client) return null
  const names = new Map(rows.map((c) => [c.id, c.name]))
  const [records, declared, calibrated] = await Promise.all([readRecords([clientId]), readDeclared([clientId]), readCalibrated([clientId])])
  return {
    client,
    checklist: checklistFor(inputsFor(client, records, declared, calibrated, names)),
    others: rows.filter((c) => c.id !== clientId).map((c) => ({ id: c.id, name: c.name })),
    // Only a missing relation means 0054 is not applied; a failed READ says nothing
    // about whether a write would work, so it does not block recording.
    recordable: records !== 'not_migrated',
    today: lisbonToday(new Date()),
    createdOn: lisbonToday(new Date(client.created_at)),
  }
}
