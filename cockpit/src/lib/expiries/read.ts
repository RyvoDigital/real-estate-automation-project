import 'server-only'
import { admin } from '@/lib/supabase/admin'
import { gateClientIds } from '@/lib/gate-clients'
import { agencyFacts, clientFacts, listingReferences } from '@/lib/publication/facts-store'
import { classifyStillGood } from '@/lib/publication/still-good'
import { buildExpiries, type Expiries, type ExpiriesInputs } from './model'

/*
 * The reads behind the one expiries module (./model.ts). Today reads this now;
 * /ops/expiries will in C5. Each source fails on its own and is named in
 * `failures`, never folded into an empty list.
 *
 *   The deploy key: the latest health_runs row's n8n_api_key_exp and ran_at
 *   (0051). Narrow columns.
 *   Each client (gate clients excepted): the SAME three reads and the SAME
 *   classifier "What is still good" uses, per client.
 */
export async function readExpiries(now = new Date()): Promise<Expiries> {
  const db = admin()

  let deployKey: ExpiriesInputs['deployKey']
  try {
    const { data, error } = await db.from('health_runs').select('ran_at, n8n_api_key_exp').order('ran_at', { ascending: false }).limit(1)
    deployKey = error ? null : !data?.length ? 'no_run' : { exp: (data[0].n8n_api_key_exp as string | null) ?? null, readAt: data[0].ran_at as string }
  } catch { deployKey = null }

  let clients: ExpiriesInputs['clients']
  try {
    const gate = await gateClientIds()
    const { data, error } = await db.from('clients').select('id, name').order('name')
    if (error) clients = null
    else {
      const rows = ((data ?? []) as { id: string; name: string }[]).filter((c) => !gate.includes(c.id))
      clients = await Promise.all(rows.map(async (c) => {
        try {
          const [propertyFacts, agency, listings] = await Promise.all([clientFacts(c.id), agencyFacts(c.id), listingReferences(c.id)])
          return { id: c.id, name: c.name, stillGood: classifyStillGood({ propertyFacts, agencyFacts: agency, listings, now }) }
        } catch {
          return { id: c.id, name: c.name, stillGood: null }
        }
      }))
    }
  } catch { clients = null }

  return buildExpiries({ deployKey, clients, now })
}
