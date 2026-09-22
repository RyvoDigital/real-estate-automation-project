import 'server-only'
import { admin } from '@/lib/supabase/admin'
import type { PreviousSitting } from './calibrate-reference'
import type { Answers } from './thresholds'
import type { Thresholds } from './score'

/**
 * What the calibration screen reads (checkpoint 2, 22 Sep 2026).
 *
 *   🔒 THE PREVIOUS SITTING COMES FROM calibration_records (0056), the record
 *      of what was said, not from the config the engine reads.
 *   🔒 A FAILED READ IS A FAILURE, NEVER "NOT CALIBRATED YET". The read this
 *      replaces (screen-read.ts readCalibration) took `data ?? []`, so an error
 *      rendered as "you have not answered these questions", and the operator
 *      would re-run a conversation the agency had already had.
 */
export type CalibrationScreen = {
  /** null when no such client (a read that worked and found nothing) */
  client: { id: string; name: string } | null
  /** the latest sitting; null = none recorded */
  previous: PreviousSitting | null
  /** a read that failed, as thrown: the screen says so and claims nothing about the previous sitting */
  failure: string | null
}

type Res<T> = { data: T | null; error: { message: string } | null }
type LatestRow = { answers: Answers; answered_by: string; recorded_by: string; recorded_at: string; thresholds: Thresholds }

/** PURE: the two reads' results to what the screen may say. A failure anywhere claims nothing about a previous sitting. */
export function calibrationScreenFrom(client: Res<{ id: string; name: string }>, latest: Res<LatestRow[]>): CalibrationScreen {
  const failures = [client.error && `clients: ${client.error.message}`, latest.error && `calibration_records: ${latest.error.message}`].filter(Boolean) as string[]
  const row = latest.error ? undefined : (latest.data ?? [])[0]
  return {
    client: client.data ? { id: client.data.id, name: client.data.name } : null,
    previous: row ? { answers: row.answers, answeredBy: row.answered_by, recordedBy: row.recorded_by, recordedAt: row.recorded_at, thresholds: row.thresholds } : null,
    failure: failures.length ? failures.join(' · ') : null,
  }
}

export async function readCalibrationScreen(clientId: string): Promise<CalibrationScreen> {
  const db = admin()
  const [client, latest] = await Promise.all([
    db.from('clients').select('id, name').eq('id', clientId).maybeSingle(),
    db.from('calibration_records').select('answers, answered_by, recorded_by, recorded_at, thresholds')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1),
  ])
  return calibrationScreenFrom(client as Res<{ id: string; name: string }>, latest as Res<LatestRow[]>)
}
