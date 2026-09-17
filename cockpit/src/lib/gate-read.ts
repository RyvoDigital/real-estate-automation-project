import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { resolveJurisdiction, REFUSAL_MEANS } from '@/lib/jurisdiction'
import { isReservedTestNumber, RESERVED_TEST_REASON } from '@/lib/reserved-numbers'
import type { PolicyRow } from '@/lib/jurisdiction-policy'
import { decideGate, type ConsentFacts, type GateVerdict } from '@/lib/gate'

/**
 * The gate's IO half: read the two facts, then hand them to `decideGate`.
 *
 * Kept apart from gate.ts so the decision stays importable without a database
 * (see that file's header). Nothing here decides anything -- if a rule appears
 * in this file it is in the wrong file.
 */
/** The IO wrapper. Reads the two facts, then decides. */
export async function mayContact(clientId: string, phone: string): Promise<GateVerdict> {
  // Refuse the reserved range before spending a query on it.
  if (isReservedTestNumber(phone)) {
    return { permitted: false, layer: 'reserved', reason: 'reserved_test_number', detail: RESERVED_TEST_REASON }
  }

  const j = resolveJurisdiction(phone)
  if (!j.ok) {
    return { permitted: false, layer: 'resolution', reason: j.reason, detail: REFUSAL_MEANS[j.reason] }
  }

  // consent_by_contact, NEVER leads_consent: an objection outlives the lead row
  // that carried it, and the lead-shaped view would miss exactly the contacts
  // who most need to be missed.
  const { data: consent, error: cErr } = await admin()
    .from('consent_by_contact')
    .select('state, segment, occurred_at, event_id')
    .eq('client_id', clientId)
    .eq('phone_e164', j.e164)
    .maybeSingle()
  if (cErr) throw new Error(`gate: consent read failed: ${cErr.message}`)

  const { data: policy, error: pErr } = await admin()
    .from('jurisdiction_policy')
    .select('*')
    .eq('country', j.country)
    .maybeSingle()
  if (pErr) throw new Error(`gate: policy read failed: ${pErr.message}`)

  return decideGate({
    phone,
    consent: (consent as ConsentFacts) ?? null,
    policy: (policy as PolicyRow | null) ?? null,
  })
}

