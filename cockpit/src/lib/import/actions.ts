'use server'

import { revalidatePath } from 'next/cache'
import { requireOperator } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { commitBatch, createBatch, getBatch, revertBatch, saveMapping } from './store'
import type { Mapping, Proposal, ProposedColumn, Target } from './types'

const TARGETS: Target[] = [
  'full_name', 'first_name', 'last_name', 'phone', 'email', 'budget_min', 'budget_max',
  'budget_range', 'area', 'property_type', 'bedrooms', 'timeline', 'last_contact_at',
  'notes', 'consent', 'source', 'ignore',
]

export type ActionResult = { ok: boolean; message: string; batchId?: string }

const MAX_BYTES = 8 * 1024 * 1024

export async function uploadList(form: FormData): Promise<ActionResult> {
  const operator = await requireOperator()
  const file = form.get('file')
  const clientId = String(form.get('clientId') ?? '')

  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a file first.' }
  if (!clientId) return { ok: false, message: 'Choose which client this list belongs to.' }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: `That file is ${(file.size / 1e6).toFixed(1)}MB and the limit is 8MB. Split it, or tell me and I will raise the limit.` }
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const batch = await createBatch({ clientId, filename: file.name, bytes, uploadedBy: operator.email })
    revalidatePath('/import')
    return { ok: true, message: `Read ${batch.source_headers.length} columns from ${file.name}.`, batchId: batch.id }
  } catch (e) {
    // Stated, never swallowed: a file we cannot read is the operator's cue to
    // send a different export, and "nothing happened" tells them nothing.
    return { ok: false, message: `That file could not be read: ${(e as Error).message}` }
  }
}

/**
 * Ask the model to refine the proposal.
 *
 * The cockpit holds no Anthropic key — this goes through n8n, the same path
 * the reply drafter uses. If it is unreachable the deterministic proposal
 * stands and the operator is TOLD, because a silently worse mapping is the
 * §2.4 failure in a new costume.
 */
export async function refineMapping(batchId: string): Promise<ActionResult> {
  await requireOperator()
  const base = process.env.N8N_SEND_URL
  const secret = process.env.N8N_SEND_SECRET
  if (!base || !secret) {
    return { ok: false, message: 'Claude was not consulted: the n8n webhook is not configured here. The mapping below is from the column headers and sample values.' }
  }

  const batch = await getBatch(batchId)
  if (!batch) return { ok: false, message: 'That import no longer exists.' }

  // An operator-confirmed `ignore` sends no values — if a column is being
  // dropped, its contents have no business leaving the server. Enforced in the
  // n8n node too; this is the first of the two gates, not the only one.
  const approved = batch.mapping ?? {}
  const columns = batch.proposal.columns.map((c) => ({
    ...c,
    target: approved[c.column] ?? c.target,
    locked: Boolean(approved[c.column]),
  }))

  try {
    const res = await fetch(base.replace(/\/cockpit-send$/, '/cockpit-map'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ryvo-cockpit-secret': secret },
      body: JSON.stringify({ columns }),
    })
    const body = (await res.json()) as Proposal & { ok?: boolean; error?: string }
    if (!res.ok || !body.columns) {
      return { ok: false, message: `Claude was not consulted (${res.status}${body.error ? `: ${body.error}` : ''}). The mapping below is unchanged.` }
    }

    // Whatever comes back, only OUR fields are stored.
    const clean: ProposedColumn[] = body.columns
      .filter((c) => batch.proposal.columns.some((g) => g.column === c.column))
      .map((c) => ({ ...c, target: TARGETS.includes(c.target) ? c.target : 'ignore' }))

    await admin().from('import_batches').update({ proposal: { by: body.by, columns: clean, note: body.note } }).eq('id', batchId)
    revalidatePath(`/import/${batchId}`)
    const changed = clean.filter((c) => (c as { changed?: string }).changed).length
    return { ok: true, message: changed ? `Claude changed ${changed} column${changed === 1 ? '' : 's'}.` : 'Claude agreed with every column.' }
  } catch (e) {
    return { ok: false, message: `Claude was not consulted: ${(e as Error).message}. The mapping below is unchanged.` }
  }
}

export async function approveMapping(batchId: string, form: FormData): Promise<ActionResult> {
  const operator = await requireOperator()
  const batch = await getBatch(batchId)
  if (!batch) return { ok: false, message: 'That import no longer exists.' }

  const mapping: Mapping = {}
  for (const c of batch.proposal.columns) {
    const chosen = String(form.get(`col:${c.column}`) ?? 'ignore')
    mapping[c.column] = (TARGETS.includes(chosen as Target) ? chosen : 'ignore') as Target
  }

  try {
    await saveMapping(batchId, mapping, operator.email)
    revalidatePath(`/import/${batchId}`)
    return { ok: true, message: 'Mapping saved. This is what would land — nothing is written yet.' }
  } catch (e) {
    return { ok: false, message: `Could not save the mapping: ${(e as Error).message}` }
  }
}

export async function commit(batchId: string): Promise<ActionResult> {
  await requireOperator()
  try {
    const { inserted } = await commitBatch(batchId)
    revalidatePath('/import')
    revalidatePath(`/import/${batchId}`)
    revalidatePath('/leads')
    return { ok: true, message: `${inserted} lead${inserted === 1 ? '' : 's'} imported.` }
  } catch (e) {
    return { ok: false, message: `Nothing was imported: ${(e as Error).message}` }
  }
}

export async function revert(batchId: string): Promise<ActionResult> {
  await requireOperator()
  try {
    const plan = await revertBatch(batchId)
    revalidatePath('/import')
    revalidatePath(`/import/${batchId}`)
    revalidatePath('/leads')
    const kept = plan.retained.length ? `, ${plan.retained.length} kept because they have been talked to since` : ''
    return { ok: true, message: `${plan.removable.length} lead${plan.removable.length === 1 ? '' : 's'} removed${kept}. No message or event was deleted.` }
  } catch (e) {
    return { ok: false, message: `Nothing was reverted: ${(e as Error).message}` }
  }
}
