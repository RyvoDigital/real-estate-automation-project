'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { recordExemptionAct, type ExemptionDeps } from './exemption-core'

/**
 * Recording that a property is exempt from certification. It parses the form
 * and nothing more: the rules are in exemption-core.ts, and the write is
 * record_exemption (0057) — the act, the current value and the event, or none.
 *
 * TWO PEOPLE, NOT ONE: `declared_by` is the person at the agency, typed; the
 * recorder is the session. The outcome goes back in the URL, never as a throw.
 */
const deps: ExemptionDeps = {
  record: async (args) => {
    const { error } = await admin().rpc('record_exemption', args)
    return { error: error ? { code: error.code ?? null, message: error.message } : null }
  },
}

export async function declareExemptionAction(formData: FormData): Promise<void> {
  const who = await requireOperator()
  const text = (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v : null }
  const listingId = text('listingId') ?? ''
  const back = `/listings/${listingId}/exemption`

  const result = await recordExemptionAct({
    exemptionId: text('exemptionId'), listingId, requirementId: text('requirementId'),
    declaredBy: text('declaredBy'), basis: text('basis'),
  }, who.email, deps)

  if (!result.ok) redirect(`${back}?erro=${encodeURIComponent(result.reason)}`)
  revalidatePath(`/listings/${listingId}`)
  revalidatePath(back)
  redirect(`${back}?${result.alreadyRecorded ? 'jaGuardado' : 'guardado'}=1`)
}
