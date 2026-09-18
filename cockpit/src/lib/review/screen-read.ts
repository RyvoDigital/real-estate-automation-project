import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { reconcileAsks, type OmissionReport } from './reconcile-asks'
import type { AskRow, CloseRow } from './disposition'

/**
 * Reading the closes and the asks behind them. Reads only.
 *
 * ⚠️ NOTHING HERE SENDS, AND NOTHING HERE REPAIRS. It is the screen's half of a
 * reconciliation, and a reconciliation that could act would be tempted — on
 * finding somebody unasked — to ask them, six weeks late, outside every window
 * and into a quality rating it cannot see. The finding goes to a person.
 *
 * The split is the one that made `dispatch` testable after `server-only` bit
 * twice: the pure function takes rows, this file fetches them.
 */

export type ReviewScreen = {
  clientName: string
  /** Null means Automation 05 does not run for this agency at all. */
  reviewLink: string | null
  enabled: boolean
  report: OmissionReport
}

export async function readReviewScreen(clientId: string): Promise<ReviewScreen> {
  const db = admin()

  const { data: client, error: cErr } = await db
    .from('clients')
    .select('name, review_link, review_requests_enabled')
    .eq('id', clientId)
    .maybeSingle()
  if (cErr) throw new Error(`review: client read failed: ${cErr.message}`)

  const { data: closeRows, error: clErr } = await db
    .from('closes')
    .select('id, listing_id, party_lead_id, party_declared_at, closed_on, reported_at, agent_asked_who_at')
    .eq('client_id', clientId)
    .order('closed_on', { ascending: true })
  if (clErr) throw new Error(`review: closes read failed: ${clErr.message}`)

  // The agency's own reference for the property, for a row somebody can act on.
  // A close may have no listing, which is a worse record and still a real sale.
  const listingIds = [...new Set((closeRows ?? []).map((c) => c.listing_id).filter(Boolean))] as string[]
  const refs = new Map<string, string | null>()
  if (listingIds.length) {
    const { data: listings } = await db
      .from('listings').select('id, reference').in('id', listingIds)
    for (const l of listings ?? []) refs.set(l.id as string, (l.reference as string) ?? null)
  }

  const closes: CloseRow[] = (closeRows ?? []).map((c) => ({
    closeId: c.id as string,
    clientId,
    listingReference: c.listing_id ? refs.get(c.listing_id as string) ?? null : null,
    partyLeadId: (c.party_lead_id as string) ?? null,
    partyDeclaredAt: (c.party_declared_at as string) ?? null,
    reportedAt: c.reported_at as string,
    agentAskedWhoAt: (c.agent_asked_who_at as string) ?? null,
    closedOn: c.closed_on as string,
  }))

  /*
   * ⚠️ THE SENDS ARE READ UNCONDITIONALLY, AND THE MISSING `if` IS THE POINT.
   *
   * The first version skipped this query when there were no closes — an
   * optimisation worth nothing against an indexed column — and in doing so gave
   * `asks` a second meaning. `undefined` means WE DID NOT LOOK, and it makes
   * the report say "nothing was compared"; an agency with no closes yet would
   * have been told the page could not be trusted when the truth was that there
   * was nothing on it to trust or doubt.
   *
   * That is 5k arriving from the other direction: not an absence read as a
   * result, but a result manufactured from a shortcut. A read that always
   * happens has one meaning, and a variable with one meaning cannot be misread.
   *
   * Found by a sabotage whose predicted failure set was EMPTY — no test could
   * tell the two branches apart, because the branch was the defect. The fix was
   * to delete it rather than to test both sides of it.
   */
  const { data: sends, error: sErr } = await db
    .from('sends')
    .select('close_id, status, gate_layer, gate_reason, gate_detail, provider_message_id, sent_at, error, intent_recorded_at')
    .eq('client_id', clientId)
    .not('close_id', 'is', null)
  if (sErr) throw new Error(`review: sends read failed: ${sErr.message}`)
  const asks: AskRow[] = (sends ?? []).map((s) => ({
    closeId: s.close_id as string,
    status: s.status as AskRow['status'],
    layer: (s.gate_layer as AskRow['layer']) ?? null,
    reason: (s.gate_reason as string) ?? null,
    detail: (s.gate_detail as string) ?? null,
    providerMessageId: (s.provider_message_id as string) ?? null,
    sentAt: (s.sent_at as string) ?? null,
    error: (s.error as string) ?? null,
    intentRecordedAt: s.intent_recorded_at as string,
  }))

  return {
    clientName: (client?.name as string) ?? '',
    reviewLink: (client?.review_link as string) ?? null,
    enabled: client?.review_requests_enabled !== false,
    report: reconcileAsks(closes, asks, {
      agencyDisabled: client?.review_requests_enabled === false,
      hasReviewDestination: Boolean(client?.review_link),
    }),
  }
}
