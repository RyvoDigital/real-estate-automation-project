'use server'

import { revalidatePath } from 'next/cache'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { exemptionRecord, validateExemption } from './exemption'

/**
 * Recording that a property is exempt from certification.
 *
 * TWO PEOPLE, NOT ONE. `declared_by` is the person at the agency; the operator
 * driving the screen is recorded separately. Collapsing them would put our name
 * on their assertion, and the assertion here is that a property is legally
 * exempt from a certificate — which is not a thing we may claim to know.
 *
 * 0028 refuses an exemption missing an author, a basis or a date, so the shape
 * is enforced twice: here where the person is, and at the database where a
 * value from any other path arrives.
 */
export async function declareExemptionAction(formData: FormData): Promise<void> {
  const who = await requireOperator()
  const listingId = String(formData.get('listingId') ?? '')

  const db = admin()
  const { data: listing } = await db
    .from('listings')
    .select('id, client_id, energy_class')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) throw new Error(`exemption: no listing ${listingId}`)

  const input = {
    listingId,
    basis: String(formData.get('basis') ?? ''),
    declaredBy: String(formData.get('declaredBy') ?? ''),
    recordedBy: who.email,
    alreadyRated: Boolean((listing.energy_class as string | null)?.trim()),
  }

  const problem = validateExemption(input)
  // Shown, never swallowed. The screen re-renders carrying the sentence.
  if (problem) throw new Error(`exemption:${problem}`)

  const { error } = await db
    .from('listings')
    .update({ energy_exemption: exemptionRecord(input), updated_at: new Date().toISOString() })
    .eq('id', listingId)
  if (error) throw new Error(`exemption: write failed: ${error.message}`)

  // The append-only record of the act itself, beside the current value — so
  // "who said this property needed no certificate, and when" survives the value
  // being corrected later.
  await db.from('events').insert({
    client_id: listing.client_id,
    type: 'listing.exemption_declared',
    severity: 'info',
    summary: `${input.declaredBy.trim()} declared this property exempt from certification`,
    data: { listing_id: listingId, declared_by: input.declaredBy.trim(),
            basis: input.basis.trim(), recorded_by: who.email },
  })

  revalidatePath(`/listings/${listingId}`)
  revalidatePath(`/listings/${listingId}/exemption`)
}
