'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { recordCalibration, type CalibrateDeps } from './calibrate-core'
import { refusalQuery } from '@/lib/refusals'

/**
 * Saving a calibration sitting. It parses the form and nothing more: every
 * rule is in calibrate-core.ts, and the write is record_calibration (0056): the
 * record and the engine's config in ONE transaction, or neither.
 *
 * The recorder is the SESSION, never a form field; who at the agency answered
 * is typed on the form, because only the person in the room knows.
 *
 * The outcome goes back in the URL rather than as a thrown error: a refusal in
 * front of an agent is a sentence on the screen, never an error page.
 */
const deps: CalibrateDeps = {
  record: async (args) => {
    const { data, error } = await admin().rpc('record_calibration', args)
    return { data: (data as string | null) ?? null, error: error ? { code: error.code ?? null, message: error.message } : null }
  },
}

export async function saveCalibrationAction(formData: FormData): Promise<void> {
  const who = await requireOperator()
  const text = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v : null
  }
  const clientId = text('clientId') ?? ''
  const back = `/calibrate/${clientId}`

  const result = await recordCalibration({
    calibrationId: text('calibrationId'),
    clientId,
    answeredBy: text('answeredBy'),
    budgetSaid: text('budgetSaid'),
    budgetMost: text('budgetMost'),
    budgetStretchMost: text('budgetStretchMost'),
    showsOneFewerBedroom: text('showsOneFewerBedroom'),
    ofHowMany: text('ofHowMany'),
    strongAtLeast: text('strongAtLeast'),
    possibleAtLeast: text('possibleAtLeast'),
    adjacency: text('adjacency'),
  }, who.email, deps)

  if (!result.ok && result.kind === 'problems') {
    redirect(`${back}?campos=${encodeURIComponent(result.problems.map((p) => `${p.field}:${p.why}`).join(','))}`)
  }
  // The KEY travels, never a sentence: the screen says it in the agency's language.
  if (!result.ok) redirect(`${back}?${refusalQuery(result.refusal)}`)
  revalidatePath(back)
  revalidatePath('/listings')
  if (result.alreadyRecorded) redirect(`${back}?jaGuardado=1`)
  redirect(`${back}?guardado=1`)
}
