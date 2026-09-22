'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { handBackToAI } from '@/lib/actions'

/**
 * Handing ONE lead back to the AI, from /c/<client>/escalations (brief III §2;
 * §5.3's explicit hand-back). 22 Sep 2026.
 *
 *   🔒 ONE LEAD, NEVER THE LIST. The screen's "no bulk hand-back" stays: a
 *      button that clears twelve flags at once is a button that clears the one
 *      you had not read yet.
 *   🔒 CONFIRMED, and the confirmation is CHECKED HERE. The same rule as
 *      retiring an obligation: the markup asks, and the server refuses if the
 *      answer did not come back. A form that only asks in the browser is asking
 *      nobody.
 *   🔴 THE KEY TRAVELS, never a sentence and never anything about the lead: the
 *      screen says the words (lib/escalations/copy.ts).
 *
 * The write itself is `handBackToAI` in lib/actions.ts, unchanged: it DELETES
 * the escalated key rather than nulling it (§7 of engineering-lessons), and
 * writes the audit event. This wrapper adds the form, the confirmation and the
 * revalidation of THIS screen, which lib/actions.ts does not know about.
 */
export async function handBackFromEscalations(formData: FormData): Promise<void> {
  const text = (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v : '' }
  const clientId = text('clientId')
  const leadId = text('leadId')
  const back = `/c/${clientId}/escalations`

  if (!clientId || !leadId) redirect(`${back}?handback=noLead`)
  // 🔒 The second step, enforced: an unticked box is not a hand-back.
  if (text('confirm') !== 'yes') redirect(`${back}?handback=unconfirmed`)

  const result = await handBackToAI(leadId)

  revalidatePath(back)
  revalidatePath('/today')
  if (!result.ok) {
    // The two failures that mean different things: already not escalated, and the write failed.
    redirect(`${back}?handback=${/not escalated/i.test(result.message) ? 'notEscalated' : 'failed'}`)
  }
  // 🔴 A hand-back whose audit event did not write is NOT a clean hand-back.
  redirect(`${back}?handback=${/audit event failed/i.test(result.message) ? 'doneNoEvent' : 'done'}`)
}
