import 'server-only'
import { cache } from 'react'
import { admin } from '@/lib/supabase/admin'

/**
 * The deploy gate's test clients, kept OUT of every operator-wide list and count.
 *
 * 22 Sep 2026: the gate's runs had left 78 escalated leads under the gate client,
 * all named João, and the operator's Queue showed them. The operator handed back
 * one of them instead of the Ryvo Test Client's lead after a deploy. With a real
 * client, a genuine escalation would be buried the same way.
 *
 *   🔒 Identified by the MARKER, never by name: a client whose automation has
 *      config.gate_only = true (set when the gate was built), exactly as The
 *      Month reads it (lib/month/read.ts).
 *   🔒 Operator-wide reads only. A read narrowed to ONE client (/c/[client]/…, the
 *      /leads client filter) is the explicit route and is never filtered, so the
 *      gate client stays reachable when someone asks for it.
 *   🔒 A failed read of the marker hides nothing: the lists show the gate client
 *      rather than risk hiding a real one.
 */
export const gateClientIds = cache(async (): Promise<string[]> => {
  try {
    const { data, error } = await admin().from('client_automations').select('client_id').eq('config->>gate_only', 'true')
    if (error) return []
    return [...new Set((data ?? []).map((r) => (r as { client_id: string }).client_id))]
  } catch {
    return []
  }
})

/** For a NOT NULL client_id (leads): drop the gate clients' rows. */
// Typed loosely on purpose: Supabase's builder types are too deep to constrain
// generically (TS2589). The behaviour is pinned by tests/gate-clients.test.ts.
export function withoutGateClients<Q>(q: Q, ids: string[]): Q {
  if (!ids.length) return q
  return (q as unknown as { not: (col: string, op: string, v: string) => Q }).not('client_id', 'in', `(${ids.join(',')})`)
}

/**
 * For a NULLABLE client_id (events). `NOT IN` alone drops the NULL rows too, and an
 * anomaly that names no client is exactly what the operator-wide screen exists to
 * show, so the NULLs are kept explicitly.
 */
export function withoutGateClientsKeepingUnattributed<Q>(q: Q, ids: string[]): Q {
  if (!ids.length) return q
  return (q as unknown as { or: (f: string) => Q }).or(`client_id.is.null,client_id.not.in.(${ids.join(',')})`)
}
