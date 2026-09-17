import 'server-only'

import { admin } from '@/lib/supabase/admin'
import type { SendStore } from '@/lib/send/dispatch'

/**
 * The service-role implementation of `SendStore`.
 *
 * This file carries the `server-only` guard because it reaches the key; dispatch
 * does not, because it reaches nothing. That split is why the retry rules are
 * testable without weakening the control that keeps the service key out of a
 * browser bundle.
 */
export const sendStore: SendStore = {
  async read(sendId) {
    const { data, error } = await admin()
      .from('sends')
      .select('id, status, idempotency_key, gate_verdict, phone_e164, attempts')
      .eq('id', sendId)
      .maybeSingle()
    if (error) throw new Error(`sendStore.read: ${error.message}`)
    return (data as Awaited<ReturnType<SendStore['read']>>) ?? null
  },

  async update(sendId, patch) {
    const { error } = await admin().from('sends').update(patch).eq('id', sendId)
    if (error) throw new Error(`sendStore.update: ${error.message}`)
  },
}
