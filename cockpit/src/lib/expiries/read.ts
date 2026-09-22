import 'server-only'
import { admin } from '@/lib/supabase/admin'
import { hiddenClients } from '@/lib/hidden-clients'
import { agencyFacts, clientFacts, listingReferences } from '@/lib/publication/facts-store'
import { classifyStillGood } from '@/lib/publication/still-good'
import { standingClearances } from '@/lib/publication/clearances-store'
import { allAdvertisingPolicy } from '@/lib/publication/policy-store'
import { recheckClearances } from '@/lib/publication/recheck'
import { buildExpiries, type Expiries, type ExpiriesInputs, type ObligationCurrent } from './model'

/*
 * The reads behind the one expiries module (./model.ts). Today reads this now;
 * /ops/expiries will in C5. Each source fails on its own and is named in
 * `failures`, never folded into an empty list.
 *
 *   The deploy key: the latest health_runs row's n8n_api_key_exp and ran_at
 *   (0051). Narrow columns.
 *   Each client (gate clients excepted): the SAME three reads and the SAME
 *   classifier "What is still good" uses, per client.
 *   The domain (0058): the last health run that READ it, with its time, so a
 *   stale reading is shown with its age rather than as a clean date.
 *   Ryvo's own obligations (0058): ryvo_obligations_current, the chain heads.
 *   Each client's clearances: standingClearances, re-checked against the policy
 *   AS IT STANDS NOW and the client's agency facts, exactly as the re-check
 *   notice does (app/c/[client]/notice).
 */
export async function readExpiries(now = new Date(), includeRehearsals = false): Promise<Expiries> {
  const db = admin()

  let deployKey: ExpiriesInputs['deployKey']
  try {
    const { data, error } = await db.from('health_runs').select('ran_at, n8n_api_key_exp').order('ran_at', { ascending: false }).limit(1)
    deployKey = error ? null : !data?.length ? 'no_run' : { exp: (data[0].n8n_api_key_exp as string | null) ?? null, readAt: data[0].ran_at as string }
  } catch { deployKey = null }

  let domain: ExpiriesInputs['domain']
  try {
    const { data, error } = await db.from('health_runs').select('ran_at, domain_expires_on')
      .not('domain_expires_on', 'is', null).order('ran_at', { ascending: false }).limit(1)
    domain = error ? null : !data?.length ? 'never' : { expiresOn: data[0].domain_expires_on as string, readAt: data[0].ran_at as string }
  } catch { domain = null }

  let obligations: ExpiriesInputs['obligations']
  try {
    const { data, error } = await db.from('ryvo_obligations_current')
      .select('id, obligation_id, act, kind, label, expires_on, no_expiry_stated, card_brand, card_last_four, card_exp_month, card_exp_year, services, note, recorded_by, recorded_at')
    obligations = error ? null : ((data ?? []) as ObligationCurrent[])
  } catch { obligations = null }

  let clients: ExpiriesInputs['clients']
  let clearances: ExpiriesInputs['clearances']
  try {
    // 🔒 Rehearsals and the gate's client are left out unless the screen asked
    // for them, by the flag and never by name (lib/hidden-clients.ts).
    const gate = (await hiddenClients(includeRehearsals)).ids
    const { data, error } = await db.from('clients').select('id, name').order('name')
    if (error) { clients = null; clearances = null }
    else {
      const rows = ((data ?? []) as { id: string; name: string }[]).filter((c) => !gate.includes(c.id))
      let policy: Awaited<ReturnType<typeof allAdvertisingPolicy>> | null = null
      try { policy = await allAdvertisingPolicy() } catch { policy = null }
      clearances = await Promise.all(rows.map(async (c) => {
        try {
          if (!policy) return { id: c.id, name: c.name, recheck: null }
          const [standing, agency, listings] = await Promise.all([standingClearances(c.id), agencyFacts(c.id), listingReferences(c.id)])
          const ref = listings
          const rows = standing.map((x) => ({ clearanceId: x.id, listingId: x.listingId, reference: ref.get(x.listingId) ?? null, satisfied: x.satisfied,
            country: x.country, region: x.region, decidedAt: x.decidedAt, noticeSentAt: x.noticeSentAt }))
          return { id: c.id, name: c.name, recheck: recheckClearances(rows, { now, policy, agencyFacts: agency }) }
        } catch { return { id: c.id, name: c.name, recheck: null } }
      }))
      clients = await Promise.all(rows.map(async (c) => {
        try {
          const [propertyFacts, agency, listings] = await Promise.all([clientFacts(c.id), agencyFacts(c.id), listingReferences(c.id)])
          return { id: c.id, name: c.name, stillGood: classifyStillGood({ propertyFacts, agencyFacts: agency, listings, now }) }
        } catch {
          return { id: c.id, name: c.name, stillGood: null }
        }
      }))
    }
  } catch { clients = null; clearances = null }

  return buildExpiries({ deployKey, clients, domain, obligations, clearances, now })
}
