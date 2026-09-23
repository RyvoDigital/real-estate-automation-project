import 'server-only'
import { admin } from '@/lib/supabase/admin'
import { ANOMALY_WINDOW_DAYS } from '@/lib/data'
import { parseEscalated } from '@/lib/escalation'
import { readExpiries } from '@/lib/expiries/read'
import { readOnboardingIndex } from '@/lib/onboarding-read'
import { buildClientList, type ClientAutomation, type ClientList, type ClientListInputs } from './model'

/**
 * The reads behind /clients (checkpoint 1, 23 Sep 2026).
 *
 *   🔒 ONE QUERY PER TABLE, NEVER ONE PER CLIENT. readAutomations() costs four
 *      round trips for ONE client; a loop over it would be 4N against a
 *      database on another continent, and it would grow with the business.
 *      Everything here is `.in('client_id', ids)` and grouped in memory.
 *   🔴 EVERY READ FAILS ON ITS OWN. One map comes back null and that column
 *      says "unknown" while the rest of the screen still works — the opposite
 *      of a throw, which would take down the whole list because the fault
 *      count was slow.
 *   🔒 REHEARSALS ARE INCLUDED HERE and marked by the model: this screen is
 *      who exists. The deploy gate's client is not, because readOnboardingIndex
 *      leaves it out — it is our test rig, not an agency, and every other
 *      operator surface already hides it.
 *   🔒 THE EXPIRIES COME FROM THE ONE EXPIRIES MODULE, grouped by owner. A
 *      second definition of "run out" on this screen would disagree with
 *      /ops/expiries on the day it mattered.
 */

const ok = <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> =>
  Promise.resolve(p).then((r) => (r.error ? null : (r.data ?? ([] as unknown as T))), () => null)

/** Which automations each client has, and which are on. */
async function readAutomationsForAll(ids: string[]): Promise<Map<string, ClientAutomation[]> | null> {
  if (ids.length === 0) return new Map()
  const [defs, mine] = await Promise.all([
    ok(admin().from('automations').select('id, key, name')),
    ok(admin().from('client_automations').select('client_id, automation_id, enabled').in('client_id', ids)),
  ])
  if (defs === null || mine === null) return null
  const byId = new Map((defs as { id: string; key: string; name: string }[]).map((d) => [d.id, d]))
  const out = new Map<string, ClientAutomation[]>()
  for (const r of mine as { client_id: string; automation_id: string; enabled: boolean }[]) {
    const def = byId.get(r.automation_id)
    const list = out.get(r.client_id) ?? []
    list.push({ key: def?.key ?? r.automation_id, name: def?.name ?? 'an automation we could not name', enabled: Boolean(r.enabled) })
    out.set(r.client_id, list)
  }
  return out
}

/**
 * How many leads are waiting on a human, per client.
 *
 * 🔒 The SAME predicate and the SAME parser as getQueue: `->>` so a stored JSON
 * null is excluded, then parseEscalated for the row whose key is present and
 * unreadable. A count that disagreed with the queue by one lead would be worse
 * than no count.
 */
async function readWaiting(ids: string[]): Promise<Map<string, number> | null> {
  if (ids.length === 0) return new Map()
  const rows = await ok(admin().from('leads').select('client_id, qualification')
    .not('qualification->>escalated', 'is', null).in('client_id', ids).limit(500))
  if (rows === null) return null
  const out = new Map<string, number>()
  for (const r of rows as { client_id: string; qualification: unknown }[]) {
    if (!parseEscalated(r.qualification)) continue
    out.set(r.client_id, (out.get(r.client_id) ?? 0) + 1)
  }
  return out
}

/** Faults in the anomaly window, per client. An event naming no client belongs to nobody's row. */
async function readFaults(ids: string[]): Promise<Map<string, number> | null> {
  if (ids.length === 0) return new Map()
  const since = new Date(Date.now() - ANOMALY_WINDOW_DAYS * 86_400_000).toISOString()
  const rows = await ok(admin().from('events').select('client_id, severity')
    .in('type', ['invariant.violated', 'automation.error']).gte('created_at', since).in('client_id', ids).limit(1000))
  if (rows === null) return null
  const out = new Map<string, number>()
  for (const r of rows as { client_id: string | null }[]) {
    if (!r.client_id) continue
    out.set(r.client_id, (out.get(r.client_id) ?? 0) + 1)
  }
  return out
}

/**
 * When anything last happened for each client: the later of the last automation
 * run and the last contact on a lead.
 *
 * 🔴 This is the silent-failure column. Automations on and nothing for a week
 * is the state no other screen shows per client, and it is the one that does
 * not announce itself.
 */
async function readLastActivity(ids: string[]): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map()
  const [links, leads] = await Promise.all([
    ok(admin().from('client_automations').select('id, client_id').in('client_id', ids)),
    ok(admin().from('leads').select('client_id, last_contact_at').in('client_id', ids)
      .not('last_contact_at', 'is', null).order('last_contact_at', { ascending: false }).limit(500)),
  ])
  if (links === null || leads === null) return null

  const clientOf = new Map((links as { id: string; client_id: string }[]).map((l) => [l.id, l.client_id]))
  const out = new Map<string, string>()
  const later = (id: string, at: string | null) => {
    if (!at) return
    const had = out.get(id)
    if (!had || at > had) out.set(id, at)
  }
  for (const r of leads as { client_id: string; last_contact_at: string }[]) later(r.client_id, r.last_contact_at)

  if (clientOf.size > 0) {
    const runs = await ok(admin().from('automation_runs').select('client_automation_id, started_at')
      .in('client_automation_id', [...clientOf.keys()]).order('started_at', { ascending: false }).limit(500))
    // 🔒 A failed runs read does not lose the lead dates we already have; it is
    // the one place here that degrades rather than failing the column.
    if (runs !== null) {
      for (const r of runs as { client_automation_id: string; started_at: string | null }[]) {
        const id = clientOf.get(r.client_automation_id)
        if (id) later(id, r.started_at)
      }
    }
  }
  return out
}

/** What has run out, is about to, or waits to be confirmed — per client, from lib/expiries. */
async function readExpiriesByClient(now: Date): Promise<Map<string, { runOut: number; aboutTo: number; toConfirm: number }> | null> {
  try {
    // 🔒 Rehearsals included: this screen lists them, so their expiries are theirs.
    const e = await readExpiries(now, true)
    const out = new Map<string, { runOut: number; aboutTo: number; toConfirm: number }>()
    const add = (owner: { kind: string; id?: string }, field: 'runOut' | 'aboutTo' | 'toConfirm') => {
      if (owner.kind !== 'client' || !owner.id) return
      const row = out.get(owner.id) ?? { runOut: 0, aboutTo: 0, toConfirm: 0 }
      row[field] += 1
      out.set(owner.id, row)
    }
    for (const x of e.runOut) add(x.owner, 'runOut')
    for (const x of e.aboutTo) add(x.owner, 'aboutTo')
    for (const x of e.toConfirm) add(x.owner, 'toConfirm')
    return out
  } catch {
    return null
  }
}

export async function readClientList(now = new Date()): Promise<ClientList> {
  // The clients and their checklists come from the one onboarding read: the
  // declaration's state and "is it onboarded" are its answers, not a second set.
  const index = await readOnboardingIndex()
  const clients: ClientListInputs['clients'] = index.clients === null
    ? null
    : index.clients.map(({ client, checklist }) => ({ id: client.id, name: client.name, rehearsal: client.rehearsal, checklist }))
  const ids = clients?.map((c) => c.id) ?? []

  const [automations, waiting, faults, lastActivity, expiries] = await Promise.all([
    readAutomationsForAll(ids),
    readWaiting(ids),
    readFaults(ids),
    readLastActivity(ids),
    readExpiriesByClient(now),
  ])

  return buildClientList({ clients, automations, waiting, faults, lastActivity, expiries, faultWindowDays: ANOMALY_WINDOW_DAYS, now })
}
