/**
 * The calibration's write path, as a pure core. /calibrate rebuild, checkpoint 1
 * (22 Sep 2026). The calibration is the agency's judgement about its own market,
 * and automation 03 matches on the six numbers derived from it.
 *
 * PURE: the one store verb is passed in (`CalibrateDeps`), so every path is a
 * test with fakes (tests/calibrate-core.test.ts). calibrate-actions.ts supplies
 * the real one (the record_calibration rpc, 0056) and only parses the form.
 *
 *   🔒 KEPT, NOT OVERWRITTEN. Each sitting is a new calibration_records row
 *      (0056, append-only); the config the engine reads is projected from it in
 *      the SAME transaction. Until 22 Sep 2026 the action read the whole config,
 *      merged, and wrote it back: a second sitting erased the first, and a
 *      concurrent config write in between was silently undone.
 *   🔒 THE AGENCY ANSWERS, WE RECORD. `answeredBy` is the person at the agency
 *      who gave the answers, typed; `recordedBy` is the signed-in operator, from
 *      the session. Neither may be empty and they may not be the same person.
 *   🔒 NOTHING IS ASSUMED. An empty field is null, never 0; an unanswered
 *      yes/no is null, never "no"; problemsWith() refuses every missing answer
 *      by NAME, and a refusal writes nothing.
 *   🔒 ONCE, WHATEVER THE RESUBMISSION. The calibration id is minted when the
 *      form is DRAWN and is the record's primary key: the same form sent twice
 *      is 23505 on calibration_records_pkey, reported as "already recorded".
 *   🔒 NOTHING THROWS. Every outcome is a value the screen can show: a refusal
 *      in front of an agent is a sentence, never an error page.
 */

import { deriveThresholds, problemsWith, type Answers, type Problem } from './thresholds'
import { operatorName } from '@/lib/operators'

export type CalibrationInput = {
  calibrationId: string
  clientId: string
  answeredBy: string
  recordedBy: string
  answers: Answers
}

export type CalibrateResult =
  | { ok: true; alreadyRecorded: false; recordedAt: string }
  | { ok: true; alreadyRecorded: true }
  | { ok: false; kind: 'problems'; problems: Problem[] }
  | { ok: false; kind: 'refused'; reason: string }

export type CalibrateDeps = {
  /** 🔒 THE ONE VERB: record_calibration (0056), one transaction — the record and its projection, or neither. */
  record(args: {
    p_calibration_id: string
    p_client_id: string
    p_answered_by: string
    p_recorded_by: string
    p_answers: Answers
    p_thresholds: ReturnType<typeof deriveThresholds>
  }): Promise<{ data: string | null; error: { code: string | null; message: string } | null }>
}

/** 0056's primary key. The test reads the migration to hold this name to it. */
export const ONE_CALIBRATION_KEY = 'calibration_records_pkey'

export const NO_NAME =
  'Who at the agency gave these answers has to be written down. They are their judgement, not ours. Nothing was recorded.'
export const SAME_PERSON =
  'The person answering and the person recording are the same name. The agency answers and we record; the record has to keep them apart. Nothing was recorded.'
export const NO_ID =
  'This form has no calibration id, so a resubmission could not be told from a new sitting. Nothing was recorded: reload the screen.'
/** 0056 creates a missing nurture row (disabled) itself, so this is only a catalogue without nurture in it. */
export const NO_NURTURE =
  'The follow-up automation is not in the catalogue, so there is nothing these answers could set. Nothing was recorded.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A number as an agent types it: "2.100.000", "2 100 000", "€2,1M" is not a
 * number and stays null. Empty is null, never 0.
 */
export function parseNumber(v: string | null): number | null {
  if (v === null) return null
  const s = v.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) ? n : null
}

/** The form, as the action reads it: every field exactly as submitted, null when absent. */
export type CalibrationForm = {
  calibrationId: string | null
  clientId: string
  answeredBy: string | null
  budgetSaid: string | null
  budgetMost: string | null
  budgetStretchMost: string | null
  /** 'yes' | 'no'; anything else, including the empty "choose one", is unanswered */
  showsOneFewerBedroom: string | null
  ofHowMany: string | null
  strongAtLeast: string | null
  possibleAtLeast: string | null
  adjacency: string | null
}

export function parseAnswers(f: CalibrationForm): Answers {
  const b = f.showsOneFewerBedroom
  return {
    budgetSaid: parseNumber(f.budgetSaid),
    budgetMost: parseNumber(f.budgetMost),
    budgetStretchMost: parseNumber(f.budgetStretchMost),
    // AN UNANSWERED QUESTION IS NULL, NOT "NO".
    showsOneFewerBedroom: b === 'yes' ? true : b === 'no' ? false : null,
    ofHowMany: parseNumber(f.ofHowMany),
    strongAtLeast: parseNumber(f.strongAtLeast),
    possibleAtLeast: parseNumber(f.possibleAtLeast),
    adjacency: f.adjacency ?? '',
  }
}

export async function recordCalibration(form: CalibrationForm, recordedBy: string, deps: CalibrateDeps): Promise<CalibrateResult> {
  if (!UUID.test(form.calibrationId ?? '')) return { ok: false, kind: 'refused', reason: NO_ID }
  const answeredBy = (form.answeredBy ?? '').trim()
  if (!answeredBy) return { ok: false, kind: 'refused', reason: NO_NAME }
  // The recorder's email, or the recorder's NAME typed as the answerer: either is us answering for them.
  const ours = [recordedBy, operatorName(recordedBy)].filter(Boolean).map((x) => x!.trim().toLowerCase())
  if (ours.includes(answeredBy.toLowerCase())) return { ok: false, kind: 'refused', reason: SAME_PERSON }

  const answers = parseAnswers(form)
  const problems = problemsWith(answers)
  if (problems.length > 0) return { ok: false, kind: 'problems', problems }

  const { data, error } = await deps.record({
    p_calibration_id: form.calibrationId!,
    p_client_id: form.clientId,
    p_answered_by: answeredBy,
    p_recorded_by: recordedBy.trim(),
    p_answers: answers,
    p_thresholds: deriveThresholds(answers),
  })
  if (error?.code === '23505' && error.message.includes(ONE_CALIBRATION_KEY)) return { ok: true, alreadyRecorded: true }
  if (error?.code === 'P0002') return { ok: false, kind: 'refused', reason: NO_NURTURE }
  if (error) return { ok: false, kind: 'refused', reason: `The database refused the calibration, and nothing was recorded: ${error.message}` }
  return { ok: true, alreadyRecorded: false, recordedAt: data ?? '' }
}
