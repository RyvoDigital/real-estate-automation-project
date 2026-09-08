import 'server-only'

import { admin } from '@/lib/supabase/admin'
import type { CountryCode } from 'libphonenumber-js'
import { parseFile } from './parse'
import { planImport, type Candidate } from './plan'
import { proposeMapping } from './propose'
import { planRevert, type RevertPlan } from './revert'
import type { ImportReport, Mapping, Proposal, ProposedColumn } from './types'

/**
 * Every database touch the import makes.
 *
 * The staged rows live in the batch row rather than a file store, so the
 * preview and the commit operate on exactly the same parsed data — two copies
 * would diverge and the stale one would keep reporting confidently (lesson 15).
 */

export type Batch = {
  id: string
  client_id: string
  filename: string
  format: string
  byte_size: number | null
  source_headers: string[]
  status: 'staged' | 'committed' | 'reverted'
  proposal: Proposal
  mapping: Mapping | null
  tier: string | null
  report: ImportReport & { revert?: unknown }
  staged: { line: number; values: Record<string, string> }[] | null
  created_lead_ids: string[]
  uploaded_by: string | null
  created_at: string
  committed_at: string | null
  reverted_at: string | null
}

export async function listBatches(limit = 20): Promise<Batch[]> {
  const { data, error } = await admin()
    .from('import_batches')
    .select('id, client_id, filename, format, byte_size, status, tier, report, created_lead_ids, uploaded_by, created_at, committed_at, reverted_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`import_batches list failed: ${error.message}`)
  return (data ?? []) as unknown as Batch[]
}

export async function getBatch(id: string): Promise<Batch | null> {
  const { data, error } = await admin().from('import_batches').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`import_batches read failed: ${error.message}`)
  return (data as unknown as Batch) ?? null
}

/** Phones and emails this client already holds, for cross-file dedupe (§2.5). */
async function existingContacts(clientId: string) {
  const { data, error } = await admin().from('leads').select('phone, email').eq('client_id', clientId)
  if (error) throw new Error(`existing leads read failed: ${error.message}`)
  return {
    phones: new Set((data ?? []).map((l) => l.phone).filter(Boolean) as string[]),
    emails: new Set((data ?? []).map((l) => (l.email ?? '').toLowerCase()).filter(Boolean)),
  }
}

async function importConfig(clientId: string): Promise<{ mapping: Mapping; country: CountryCode }> {
  const { data: auto } = await admin().from('automations').select('id').eq('key', 'lead_nurture').single()
  const { data } = await admin()
    .from('client_automations')
    .select('config')
    .eq('client_id', clientId)
    .eq('automation_id', auto!.id)
    .maybeSingle()
  const cfg = ((data?.config ?? {}) as { import?: { mapping?: Mapping; default_country?: string } }).import ?? {}
  return {
    mapping: cfg.mapping ?? {},
    country: (cfg.default_country ?? 'PT') as CountryCode,
  }
}

/** Parse and stage. Nothing is written to `leads` here. */
export async function createBatch(input: {
  clientId: string
  filename: string
  bytes: Buffer
  uploadedBy: string
}): Promise<Batch> {
  const parsed = await parseFile(input.filename, input.bytes)
  const stored = await importConfig(input.clientId)

  // §2.3: the mapping is asked for ONCE. If this client has an approved one,
  // it is reused and the review screen shows it as already decided.
  const heuristic = proposeMapping(parsed.headers, parsed.rows)
  const columns: ProposedColumn[] = heuristic.columns.map((c) =>
    stored.mapping[c.column]
      ? { ...c, target: stored.mapping[c.column], confidence: 'high', why: 'saved from this client’s last import' }
      : c,
  )

  const { data, error } = await admin()
    .from('import_batches')
    .insert({
      client_id: input.clientId,
      filename: input.filename,
      format: parsed.format,
      byte_size: input.bytes.length,
      source_headers: parsed.headers,
      status: 'staged',
      proposal: { by: heuristic.by, columns, note: parsed.note } satisfies Proposal,
      staged: parsed.rows,
      report: { parseErrors: parsed.parseErrors },
      uploaded_by: input.uploadedBy,
    })
    .select('*')
    .single()
  if (error) throw new Error(`import_batches insert failed: ${error.message}`)
  return data as unknown as Batch
}

/** Recompute the preview from the staged rows under a candidate mapping. */
export async function previewBatch(batch: Batch, mapping: Mapping) {
  const { country } = await importConfig(batch.client_id)
  const existing = await existingContacts(batch.client_id)
  const parseErrors = ((batch.report as { parseErrors?: { row: number; reason: string }[] }).parseErrors ?? []).map(
    (e) => ({ row: e.row, reason: e.reason, raw: {} }),
  )
  return planImport(batch.staged ?? [], mapping, {
    defaultCountry: country,
    existingPhones: existing.phones,
    existingEmails: existing.emails,
    parseErrors,
  })
}

export async function saveMapping(batchId: string, mapping: Mapping, by: string): Promise<void> {
  const batch = await getBatch(batchId)
  if (!batch) throw new Error('batch not found')
  const { report } = await previewBatch(batch, mapping)

  const { error } = await admin()
    .from('import_batches')
    .update({ mapping, tier: report.tier, report: { ...batch.report, ...report } })
    .eq('id', batchId)
  if (error) throw new Error(`mapping save failed: ${error.message}`)

  // §2.3: stored in the client's config and never asked again.
  const { data: auto } = await admin().from('automations').select('id').eq('key', 'lead_nurture').single()
  const { data: ca } = await admin()
    .from('client_automations')
    .select('id, config')
    .eq('client_id', batch.client_id)
    .eq('automation_id', auto!.id)
    .maybeSingle()
  if (ca) {
    const cfg = (ca.config ?? {}) as Record<string, unknown>
    const imp = (cfg.import ?? {}) as Record<string, unknown>
    await admin()
      .from('client_automations')
      .update({ config: { ...cfg, import: { ...imp, mapping, mapping_approved_at: new Date().toISOString(), mapping_approved_by: by } } })
      .eq('id', ca.id)
  }
}

export async function commitBatch(batchId: string): Promise<{ inserted: number; report: ImportReport }> {
  const batch = await getBatch(batchId)
  if (!batch) throw new Error('batch not found')
  if (batch.status !== 'staged') throw new Error(`this import is already ${batch.status}`)
  if (!batch.mapping) throw new Error('no mapping has been approved yet')

  const { candidates, report } = await previewBatch(batch, batch.mapping)
  const rows = candidates.map((c: Candidate) => ({
    client_id: batch.client_id,
    full_name: c.full_name,
    phone: c.phone,
    email: c.email,
    budget_min: c.budget_min,
    budget_max: c.budget_max,
    area: c.area,
    lead_type: c.property_type ? 'buyer' : null,
    timeline: c.timeline,
    stage: 'dormant',
    source: c.source ?? 'import',
    consent_status: c.consent_status,
    consent_at: c.consent_status === 'opt_in' ? new Date().toISOString() : null,
    last_contact_at: c.last_contact_at,
    qualification: {
      imported: {
        batch_id: batch.id,
        line: c.row,
        bedrooms: c.bedrooms,
        property_type: c.property_type,
        // §4.2 will read this. It is the whole reason the import exists.
        notes: c.notes,
      },
    },
  }))

  const created: string[] = []
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200)
    const { data, error } = await admin().from('leads').insert(slice).select('id')
    if (error) throw new Error(`lead insert failed at row ${i}: ${error.message}`)
    created.push(...(data ?? []).map((r) => r.id as string))
  }

  const { error } = await admin()
    .from('import_batches')
    .update({
      status: 'committed',
      committed_at: new Date().toISOString(),
      created_lead_ids: created,
      report: { ...batch.report, ...report },
      tier: report.tier,
      // The accepted rows are leads now. A second copy of a client's contact
      // list in a jsonb column is personal data held for no purpose, so it
      // goes. The REJECTS stay in `report` — naming them is the point.
      staged: null,
    })
    .eq('id', batchId)
  if (error) throw new Error(`batch commit update failed: ${error.message}`)

  return { inserted: created.length, report }
}

/**
 * Reverse an import.
 *
 * Removes leads. NEVER deletes a message or an event, under any circumstances,
 * including for the leads it does remove — see revert.ts for why the refusal,
 * rather than the absence of a cascade, is what actually protects them.
 */
export async function revertBatch(batchId: string): Promise<RevertPlan> {
  const batch = await getBatch(batchId)
  if (!batch) throw new Error('batch not found')
  if (batch.status !== 'committed') throw new Error(`only a committed import can be reverted (this one is ${batch.status})`)

  const ids = batch.created_lead_ids ?? []
  if (ids.length === 0) {
    const empty = { removable: [], retained: [], alreadyGone: [] }
    await admin().from('import_batches').update({ status: 'reverted', reverted_at: new Date().toISOString(), report: { ...batch.report, revert: empty } }).eq('id', batchId)
    return empty
  }

  const { data: present } = await admin().from('leads').select('id, full_name').in('id', ids)
  const { data: msgs } = await admin().from('messages').select('lead_id').in('lead_id', ids)
  // events reference a lead inside jsonb. `->>` not `->`: the text of a jsonb
  // null IS SQL NULL, and `->` would keep rows carrying an explicit null (§7).
  const { data: evs } = await admin().from('events').select('data').in('data->>lead_id', ids)

  const plan = planRevert({
    createdLeadIds: ids,
    present: new Map((present ?? []).map((l) => [l.id as string, (l.full_name as string) ?? null])),
    withMessages: new Set((msgs ?? []).map((m) => m.lead_id as string).filter(Boolean)),
    withEvents: new Set((evs ?? []).map((e) => (e.data as { lead_id?: string })?.lead_id).filter(Boolean) as string[]),
  })

  if (plan.removable.length) {
    const { error } = await admin().from('leads').delete().in('id', plan.removable)
    if (error) throw new Error(`revert delete failed: ${error.message}`)
  }

  await admin()
    .from('import_batches')
    .update({ status: 'reverted', reverted_at: new Date().toISOString(), report: { ...batch.report, revert: plan } })
    .eq('id', batchId)

  return plan
}
