import 'server-only'
import { admin } from '@/lib/supabase/admin'
import { ANOMALY_WINDOW_DAYS, getAnomalies, getQueue, type AnomalyFeed, type QueueRow } from '@/lib/data'
import { hiddenClients } from '@/lib/hidden-clients'
import { readExpiries } from '@/lib/expiries/read'
import { openGatesOldestFirst } from '@/lib/gates'
import { buildToday, type TodayModel } from './model'

/*
 * Every read Today makes, in one place, so the page and the outside-Next
 * preview draw the SAME model from the SAME reads. Each read fails on its own
 * and lands in its own group as readFailed; none of them stops the page.
 */

export const QUEUE_CAP = 100

export type TodayRead = {
  model: TodayModel
  /** the rows groups 1 and 2 draw (the model decides counts and previews; the rows are drawn as read) */
  queue: QueueRow[] | null
  anomalies: AnomalyFeed | null
  readAt: string
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Clients with an automation switched on, hidden ones excepted; null = the read failed. */
async function clientsWithAutomation(includeRehearsals: boolean): Promise<number | null> {
  try {
    const gate = (await hiddenClients(includeRehearsals)).ids
    const { data, error } = await admin().from('client_automations').select('client_id').eq('enabled', true)
    if (error) return null
    return new Set((data ?? []).map((r) => r.client_id as string).filter((id) => !gate.includes(id))).size
  } catch {
    return null
  }
}

export async function readToday(now = new Date(), includeRehearsals = false): Promise<TodayRead> {
  const [queue, anomalies, automation, expiries, hidden] = await Promise.all([
    getQueue(QUEUE_CAP, undefined, includeRehearsals).then((rows) => ({ rows, threw: '' }), (e) => ({ rows: null, threw: message(e) })),
    getAnomalies(includeRehearsals).then((feed) => ({ feed, threw: '' }), (e) => ({ feed: null, threw: message(e) })),
    clientsWithAutomation(includeRehearsals),
    readExpiries(now, includeRehearsals),
    // 🔒 Read once, and reported: a screen that hides rows says how many.
    hiddenClients(includeRehearsals),
  ])
  const model = buildToday({
    queue: { rows: queue.rows, threw: queue.threw, cap: QUEUE_CAP },
    anomalies: anomalies.feed
      ? { groups: anomalies.feed.groups, total: anomalies.feed.total, capped: anomalies.feed.capped, threw: '', windowDays: ANOMALY_WINDOW_DAYS }
      : { groups: null, total: 0, capped: false, threw: anomalies.threw, windowDays: ANOMALY_WINDOW_DAYS },
    clientsWithAutomation: automation,
    expiries,
    waiting: openGatesOldestFirst(),
    hidden,
    now,
  })
  return { model, queue: queue.rows, anomalies: anomalies.feed, readAt: now.toISOString() }
}
