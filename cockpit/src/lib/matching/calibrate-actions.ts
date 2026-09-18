'use server'

import { revalidatePath } from 'next/cache'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { deriveThresholds, problemsWith, type Answers } from './thresholds'

/**
 * Saving the calibration answers.
 *
 * ⚠️ IT WRITES THE DERIVED NUMBERS **AND** THE ANSWERS THEY CAME FROM.
 *
 * The engine reads the six values. The screen, six months later, has to show
 * the agency what they actually said — "you told us you'd stretch to
 * €2,100,000" — and a percentage cannot be turned back into that sentence
 * without the reference figure. Keeping only the derived numbers would mean the
 * agency could never recognise their own answer, which is the same failure as a
 * consent record that keeps our reading and discards their wording.
 *
 * Merged into the existing config rather than replacing it: `listing_ingest`
 * and `areas` live on the same row and are not ours to drop.
 */
function num(v: FormDataEntryValue | null): number | null {
  if (v === null) return null
  const s = String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) ? n : null
}

export async function saveCalibrationAction(formData: FormData): Promise<void> {
  const who = await requireOperator()
  const clientId = String(formData.get('clientId') ?? '')
  if (!clientId) throw new Error('saveCalibration: no client')

  /*
   * AN UNANSWERED QUESTION IS NULL, NOT "NO".
   *
   * The select's empty option submits '', and `String('') === 'yes'` is false —
   * so an unanswered question would have been recorded as the agency saying
   * they would NOT show a smaller property, silently, and `problemsWith` would
   * have found nothing to complain about. A missing answer must survive as
   * missing all the way to the check that refuses it.
   */
  const raw = formData.get('showsOneFewerBedroom')
  const bedrooms = raw === null || String(raw).trim() === '' ? null : String(raw)
  const answers: Answers = {
    budgetSaid: num(formData.get('budgetSaid')),
    budgetMost: num(formData.get('budgetMost')),
    budgetStretchMost: num(formData.get('budgetStretchMost')),
    showsOneFewerBedroom: bedrooms === null ? null : bedrooms === 'yes',
    ofHowMany: num(formData.get('ofHowMany')),
    strongAtLeast: num(formData.get('strongAtLeast')),
    possibleAtLeast: num(formData.get('possibleAtLeast')),
    adjacency: String(formData.get('adjacency') ?? ''),
  }

  const problems = problemsWith(answers)
  if (problems.length > 0) {
    // Shown, never swallowed. The screen re-renders with the fields named.
    throw new Error(`calibration:${JSON.stringify(problems)}`)
  }

  const db = admin()
  const { data: rows, error: readErr } = await db
    .from('client_automations')
    .select('id, config, automations!inner(key)')
    .eq('client_id', clientId)
  if (readErr) throw new Error(`saveCalibration: config read failed: ${readErr.message}`)
  const typed = (rows ?? []) as unknown as { id: string; config: Record<string, unknown>; automations: { key: string } }[]
  const row = typed.find((r) => r.automations?.key === 'lead_nurture')
  if (!row) throw new Error('saveCalibration: this client has no lead_nurture automation row')

  const config = {
    ...row.config,
    ...deriveThresholds(answers),
    calibration: {
      answers,
      recorded_by: who?.email ?? null,
      recorded_at: new Date().toISOString(),
    },
  }

  const { error } = await db.from('client_automations').update({ config }).eq('id', row.id)
  if (error) throw new Error(`saveCalibration: write failed: ${error.message}`)

  revalidatePath(`/calibrate/${clientId}`)
  revalidatePath('/listings')
}
