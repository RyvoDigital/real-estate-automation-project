import 'server-only'
import { admin } from '@/lib/supabase/admin'
import type { AutomationKey } from '@/lib/gates'
import { firstDay, lastDay, type Month } from './model'
import type { EventRow, MessageRow } from './activity'

/*
 * The reads behind "What the system did" and Firsts (lib/month/activity.ts).
 *
 *   🔒 Narrowest columns: events (client_id, type, created_at); messages
 *      (client_id, lead_id, direction, origin, created_at). NEVER messages.body —
 *      it holds strangers' words (CLAUDE.md), and a count does not need them.
 *   🔒 Paged: PostgREST returns 1000 rows by default, and a month that silently
 *      stops at 1000 is a false count.
 *   🔒 The window runs a day either side in UTC; the model then keeps what falls
 *      in the Lisbon month, so a row at 23:30 UTC on the last day is not lost.
 *   🔒 All-time Firsts are read only for REAL clients, and only when one exists.
 * Each source fails on its own (null), so one failure reaches only its panel.
 */

const EVENT_TYPES = ['lead.created', 'lead.escalated', 'viewing.booked']
const PAGE = 1000

async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

export type ActivityInputs = {
  events: EventRow[] | null
  messages: MessageRow[] | null
  /** real clients with each automation switched on; null = the read failed */
  runsFor: Map<AutomationKey, number> | null
  firstClient: string | null
  firstLead: string | null
  firstSystemReply: string | null
  firstMeeting: string | null
  failures: string[]
}

async function earliest(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<string | null> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const row = ((data ?? []) as { created_at?: string }[])[0]
  return row?.created_at ?? null
}

export async function readActivity(M: Month, realAutomationClientIds: string[], realWebClientStarts: string[]): Promise<ActivityInputs> {
  const failures: string[] = []
  const from = new Date(Date.parse(`${firstDay(M)}T00:00:00Z`) - 86_400_000).toISOString()
  const to = new Date(Date.parse(`${lastDay(M)}T00:00:00Z`) + 2 * 86_400_000).toISOString()
  const db = admin()

  const guard = async <T>(what: string, f: () => Promise<T>): Promise<T | null> => {
    try { return await f() } catch (e) { failures.push(`${what} read failed: ${(e as Error).message}`); return null }
  }

  const [events, messages, runsFor] = await Promise.all([
    guard('events', () => paged<EventRow>((a, b) => db.from('events').select('client_id, type, created_at')
      .in('type', EVENT_TYPES).gte('created_at', from).lt('created_at', to).order('created_at').range(a, b))),
    guard('messages', () => paged<MessageRow>((a, b) => db.from('messages').select('client_id, lead_id, direction, origin, created_at')
      .gte('created_at', from).lt('created_at', to).order('created_at').range(a, b))),
    guard('client automations', async () => {
      const m = new Map<AutomationKey, number>()
      if (!realAutomationClientIds.length) return m
      const { data, error } = await db.from('client_automations').select('client_id, enabled, automations(key)')
        .in('client_id', realAutomationClientIds).eq('enabled', true)
      if (error) throw new Error(error.message)
      for (const r of (data ?? []) as unknown as { automations: { key: AutomationKey } | null }[]) {
        const k = r.automations?.key
        if (k) m.set(k, (m.get(k) ?? 0) + 1)
      }
      return m
    }),
  ])

  // All-time Firsts, for real clients only, and only when there is one.
  let firstClient: string | null = realWebClientStarts.slice().sort()[0] ?? null
  let firstLead: string | null = null, firstSystemReply: string | null = null, firstMeeting: string | null = null
  if (realAutomationClientIds.length) {
    const ids = realAutomationClientIds
    const got = await guard('firsts', () => Promise.all([
      earliest(db.from('clients').select('created_at').in('id', ids).order('created_at').limit(1)),
      earliest(db.from('events').select('created_at').in('client_id', ids).eq('type', 'lead.created').order('created_at').limit(1)),
      earliest(db.from('messages').select('created_at').in('client_id', ids).eq('direction', 'outbound').eq('origin', 'ai').order('created_at').limit(1)),
      earliest(db.from('events').select('created_at').in('client_id', ids).eq('type', 'viewing.booked').order('created_at').limit(1)),
    ]))
    if (got) {
      const [c, l, r, v] = got
      if (c && (!firstClient || c.slice(0, 10) < firstClient)) firstClient = c
      ;[firstLead, firstSystemReply, firstMeeting] = [l, r, v]
    }
  }
  return { events, messages, runsFor, firstClient, firstLead, firstSystemReply, firstMeeting, failures }
}
