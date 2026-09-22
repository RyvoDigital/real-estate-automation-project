'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { refusalQuery } from '@/lib/refusals'
import { recordObligation, type ObligationDeps } from './obligations-core'

/**
 * Recording one of Ryvo's own expiries (/ops/expiries). It parses the form and
 * nothing more: the rules are in obligations-core.ts, the write is ONE insert
 * into ryvo_obligations (0058, append-only). The recorder is the session.
 */
const deps: ObligationDeps = {
  insert: async (row) => {
    const { error } = await admin().from('ryvo_obligations').insert(row)
    return { error: error ? { code: error.code ?? null, message: error.message } : null }
  },
}

export async function recordObligationAction(formData: FormData): Promise<void> {
  const who = await requireOperator()
  const text = (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v : null }
  const result = await recordObligation({
    actId: text('actId'), obligationId: text('obligationId'), supersedesId: text('supersedesId'),
    act: text('act'), kind: text('kind'), label: text('label'), expiresOn: text('expiresOn'),
    noExpiryStated: text('noExpiryStated'), cardBrand: text('cardBrand'), cardLastFour: text('cardLastFour'),
    cardExpMonth: text('cardExpMonth'), cardExpYear: text('cardExpYear'), services: text('services'), note: text('note'), confirm: text('confirm'),
  }, who.email, deps)

  // The KEY travels, never a sentence, and never anything the operator typed.
  if (!result.ok) redirect(`/ops/expiries?${refusalQuery(result.refusal)}`)
  revalidatePath('/ops/expiries')
  revalidatePath('/today')
  redirect(`/ops/expiries?${result.alreadyRecorded ? 'jaGuardado' : 'guardado'}=1`)
}
