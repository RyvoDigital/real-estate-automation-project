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

  /*
   * 🔴 ASKED TOGETHER, BECAUSE NONE OF THEM NEEDS AN ANSWER FROM ANOTHER
   * (Stage 2, 23 Sep 2026). These six were six awaits one after the next — the
   * deploy key, then the domain, then the obligations, then who is hidden, then
   * the clients, then the policy — so the screen waited for the sum of them.
   * Measured: /ops/expiries made only SEVEN requests and still had a serial
   * depth of 7.1, which is to say it did almost nothing in parallel. The cost
   * of this screen was never the queries; it was the queueing.
   */
  const [deployKey, domain, obligations, hidden, clientRows, policy] = await Promise.all([
    (async (): Promise<ExpiriesInputs['deployKey']> => {
      try {
        const { data, error } = await db.from('health_runs').select('ran_at, n8n_api_key_exp').order('ran_at', { ascending: false }).limit(1)
        return error ? null : !data?.length ? 'no_run' : { exp: (data[0].n8n_api_key_exp as string | null) ?? null, readAt: data[0].ran_at as string }
      } catch { return null }
    })(),
    (async (): Promise<ExpiriesInputs['domain']> => {
      try {
        const { data, error } = await db.from('health_runs').select('ran_at, domain_expires_on')
          .not('domain_expires_on', 'is', null).order('ran_at', { ascending: false }).limit(1)
        return error ? null : !data?.length ? 'never' : { expiresOn: data[0].domain_expires_on as string, readAt: data[0].ran_at as string }
      } catch { return null }
    })(),
    (async (): Promise<ExpiriesInputs['obligations']> => {
      try {
        const { data, error } = await db.from('ryvo_obligations_current')
          .select('id, obligation_id, act, kind, label, expires_on, no_expiry_stated, card_brand, card_last_four, card_exp_month, card_exp_year, services, note, recorded_by, recorded_at')
        return error ? null : ((data ?? []) as ObligationCurrent[])
      } catch { return null }
    })(),
    // 🔒 Rehearsals and the gate's client are left out unless the screen asked
    // for them, by the flag and never by name (lib/hidden-clients.ts).
    hiddenClients(includeRehearsals).then((h) => h.ids, () => null),
    db.from('clients').select('id, name').order('name').then(
      (r) => (r.error ? null : ((r.data ?? []) as { id: string; name: string }[])),
      () => null,
    ),
    allAdvertisingPolicy().then((p) => p, () => null),
  ])

  let clients: ExpiriesInputs['clients'] = null
  let clearances: ExpiriesInputs['clearances'] = null

  if (clientRows !== null && hidden !== null) {
    const rows = clientRows.filter((c) => !hidden.includes(c.id))
    /*
     * 🔴 ONE PASS PER CLIENT, NOT TWO. This was two `rows.map` loops, and
     * agencyFacts(c.id) and listingReferences(c.id) appeared in BOTH — the same
     * question asked twice per client, byte for byte, 2N wasted requests on
     * every screen that reads expiries (/today, /clients and this one). The
     * file's own header says "ONE QUERY PER TABLE, NEVER ONE PER CLIENT"; this
     * is the half of that which can be honoured without changing the stores.
     */
    const per = await Promise.all(rows.map(async (c) => {
      const [standing, agency, listings, propertyFacts] = await Promise.all([
        standingClearances(c.id).catch(() => null),
        agencyFacts(c.id).catch(() => null),
        listingReferences(c.id).catch(() => null),
        clientFacts(c.id).catch(() => null),
      ])
      return { c, standing, agency, listings, propertyFacts }
    }))

    clearances = per.map(({ c, standing, agency, listings }) => {
      if (!policy || standing === null || agency === null || listings === null) return { id: c.id, name: c.name, recheck: null }
      const rechecked = standing.map((x) => ({
        clearanceId: x.id, listingId: x.listingId, reference: listings.get(x.listingId) ?? null, satisfied: x.satisfied,
        country: x.country, region: x.region, decidedAt: x.decidedAt, noticeSentAt: x.noticeSentAt,
      }))
      return { id: c.id, name: c.name, recheck: recheckClearances(rechecked, { now, policy, agencyFacts: agency }) }
    })

    clients = per.map(({ c, agency, listings, propertyFacts }) => {
      if (propertyFacts === null || agency === null || listings === null) return { id: c.id, name: c.name, stillGood: null }
      return { id: c.id, name: c.name, stillGood: classifyStillGood({ propertyFacts, agencyFacts: agency, listings, now }) }
    })
  }

  return buildExpiries({ deployKey, clients, domain, obligations, clearances, now })
}
