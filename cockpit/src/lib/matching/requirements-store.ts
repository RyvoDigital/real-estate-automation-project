import 'server-only'

import { admin } from '@/lib/supabase/admin'
import type { Requirement } from './criteria'
import { extractFromStatements, isAgentNumber, type Statement } from './extract'
import { planRecompute, type StoredRequirement } from './recompute'

/**
 * Reading what a lead said, and writing what they require.
 *
 * The IO half. Every decision lives in extract.ts, recency.ts and recompute.ts,
 * which are pure and tested without a database — this file only fetches, calls
 * them, and applies the plan it is given.
 *
 * TWO SOURCES, AND THEY ARE ORDERED DIFFERENTLY
 *
 *   messages   a conversation, in the order it happened. Orderable, so the
 *              later statement is the lead's current position.
 *   notes      the imported spreadsheet cell, written over years by several
 *              people. ONE statement with no inside order, so a contradiction
 *              inside it goes to the reading that excludes least.
 *
 * The notes cell is the reason step 1 of the no-CRM design exists: for an
 * agency with no CRM it is the only place a requirement has ever been written
 * down, and the importer has been storing it since F1 under a comment saying
 * "§4.2 will read this". This is §4.2 reading it.
 */

const DERIVED_SOURCES = ['field', 'conversation', 'note'] as const

/** The areas this client's buyers actually talk about — §4.3, never a gazetteer. */
async function clientConfig(clientId: string): Promise<{ areas: string[]; agentNumbers: string[] }> {
  const { data } = await admin()
    .from('client_automations')
    .select('config, automations!inner(key)')
    .eq('client_id', clientId)
  const rows = (data ?? []) as unknown as { config: Record<string, unknown>; automations: { key: string } }[]
  const areas = new Set<string>()
  const agentNumbers = new Set<string>()
  for (const r of rows) {
    const cfg = r.config ?? {}
    for (const a of ((cfg.areas as string[]) ?? [])) areas.add(String(a))
    const li = (cfg.listing_ingest ?? {}) as { areas?: string[]; agent_numbers?: string[] }
    for (const a of (li.areas ?? [])) areas.add(String(a))
    for (const n of (li.agent_numbers ?? [])) agentNumbers.add(String(n))
  }
  return { areas: [...areas], agentNumbers: [...agentNumbers] }
}

export type RecomputeOutcome =
  | { recomputed: false; reason: 'lead_is_an_agent'; detail: string }
  | { recomputed: true; inserted: number; deleted: number; preserved: number; unparsed: string[] }

/**
 * Rebuild one lead's derived requirements from everything they have said.
 *
 * ⚠️ The delete is BY ID, and the ids come from `planRecompute` and nowhere
 * else. A delete scoped to the lead would take the agent's own sentence with
 * it and look exactly like success, because every derived row comes back.
 */
export async function recomputeRequirementsForLead(input: {
  clientId: string
  leadId: string
}): Promise<RecomputeOutcome> {
  const db = admin()
  const { areas, agentNumbers } = await clientConfig(input.clientId)

  const { data: lead, error: leadErr } = await db
    .from('leads')
    .select('id, phone, qualification')
    .eq('id', input.leadId)
    .maybeSingle()
  if (leadErr) throw new Error(`recompute: lead read failed: ${leadErr.message}`)
  if (!lead) throw new Error(`recompute: no lead ${input.leadId}`)

  // An agent is not a buyer and must never be matched as one. The Concierge's
  // tie-break sends a listing message down the LEAD path when the sender is
  // also a lead, so the listing text would otherwise become that lead's
  // requirements — the operator's own number looking like a buyer in Estoril.
  if (isAgentNumber((lead.phone as string) ?? null, agentNumbers)) {
    return {
      recomputed: false,
      reason: 'lead_is_an_agent',
      detail:
        `${lead.phone} is configured as an agent number for this client, so its messages are ` +
        'listings, not requirements. Nothing was written.',
    }
  }

  const { data: messages, error: msgErr } = await db
    .from('messages')
    .select('body, created_at')
    .eq('lead_id', input.leadId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: true })
  if (msgErr) throw new Error(`recompute: messages read failed: ${msgErr.message}`)

  const statements: Statement[] = (messages ?? [])
    .filter((m) => String(m.body ?? '').trim())
    .map((m) => ({
      text: String(m.body),
      source: 'conversation' as const,
      at: (m.created_at as string) ?? null,
    }))

  const notes = ((lead.qualification as { imported?: { notes?: string } } | null)?.imported?.notes ?? '').trim()
  if (notes) {
    // `at: null` is not a missing value to be filled in later. It is the fact
    // that this cell has no inside order, which is what selects the
    // excludes-least half of the recency rule.
    statements.push({ text: notes, source: 'note', at: null })
  }

  const extraction = extractFromStatements(statements, areas)

  const { data: existing, error: exErr } = await db
    .from('lead_requirements')
    .select('id, source')
    .eq('lead_id', input.leadId)
  if (exErr) throw new Error(`recompute: existing requirements read failed: ${exErr.message}`)

  const plan = planRecompute((existing ?? []) as StoredRequirement[], extraction.requirements)

  if (plan.deleteIds.length > 0) {
    const { error } = await db.from('lead_requirements').delete().in('id', plan.deleteIds)
    if (error) throw new Error(`recompute: delete failed: ${error.message}`)
  }

  if (plan.insert.length > 0) {
    const rows = plan.insert.map((r: Requirement) => ({
      client_id: input.clientId,
      lead_id: input.leadId,
      kind: r.kind,
      value: r.value,
      strength: r.strength,
      source: r.source,
      evidence: r.evidence,
      why: r.why,
      stated_at: r.statedAt ?? null,
      unordered: r.order === null || r.order === undefined
        ? 'this source has no inside order, so recency could not decide between its statements'
        : null,
      superseded_by: r.supersededBy ?? null,
    }))
    const { error } = await db.from('lead_requirements').insert(rows)
    if (error) throw new Error(`recompute: insert failed: ${error.message}`)
  }

  return {
    recomputed: true,
    inserted: plan.insert.length,
    deleted: plan.deleteIds.length,
    preserved: plan.preserved.length,
    unparsed: extraction.unparsed,
  }
}

export type LeadRequirements = {
  leadId: string
  requirements: Requirement[]
  fields: { budget_max: number | null; area: string | null; bedrooms: number | null }
  budgetFlexible: boolean
}

/**
 * Every lead of a client, with the requirements that still bind.
 *
 * Superseded rows are excluded here as well as in the scorer. Two filters for
 * one rule is deliberate: this is the query the run walks, and a stale
 * requirement binding a match is invisible in the output.
 */
export async function bindingRequirementsForClient(clientId: string): Promise<LeadRequirements[]> {
  const db = admin()

  const { data: leads, error: leadErr } = await db
    .from('leads')
    .select('id, budget_max, area, qualification')
    .eq('client_id', clientId)
  if (leadErr) throw new Error(`requirements: leads read failed: ${leadErr.message}`)

  const { data: reqs, error: reqErr } = await db
    .from('lead_requirements')
    .select('lead_id, kind, value, strength, source, evidence, why, stated_at')
    .eq('client_id', clientId)
    .is('superseded_by', null)
  if (reqErr) throw new Error(`requirements: read failed: ${reqErr.message}`)

  const byLead = new Map<string, Requirement[]>()
  for (const r of reqs ?? []) {
    const list = byLead.get(r.lead_id as string) ?? []
    list.push({
      kind: r.kind as Requirement['kind'],
      value: r.value,
      strength: r.strength as Requirement['strength'],
      source: r.source as Requirement['source'],
      evidence: (r.evidence as string) ?? null,
      why: r.why as string,
      statedAt: (r.stated_at as string) ?? null,
    })
    byLead.set(r.lead_id as string, list)
  }

  return (leads ?? []).map((l) => {
    const q = (l.qualification as { imported?: { bedrooms?: number | null } } | null) ?? {}
    return {
      leadId: l.id as string,
      requirements: byLead.get(l.id as string) ?? [],
      fields: {
        budget_max: (l.budget_max as number) ?? null,
        area: (l.area as string) ?? null,
        bedrooms: q.imported?.bedrooms ?? null,
      },
      // Stated flexibility lives in the extraction, not in a column. Until the
      // extractor persists it, a run treats every budget as firm -- which is the
      // TIGHTER reading, and is therefore stated here rather than left to be
      // discovered: it can only cause a match to be missed, never invented.
      budgetFlexible: false,
    }
  })
}

export const DERIVED = DERIVED_SOURCES
