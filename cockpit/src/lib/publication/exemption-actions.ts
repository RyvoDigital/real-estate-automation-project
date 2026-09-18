'use server'

import { revalidatePath } from 'next/cache'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { exemptionRecord, validateExemption } from './exemption'
import { alreadyRated, listingFacts, recordExemption } from './facts-store'

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

  // WHICH requirement this exemption is against comes from the form, resolved
  // from the property's jurisdiction by the screen. Hardcoding
  // `pt_energy_class` here would spend the generality the redesign bought.
  const requirementId = String(formData.get('requirementId') ?? '')
  if (!requirementId) throw new Error('exemption: which requirement is being exempted?')

  const db = admin()
  const { data: listing } = await db
    .from('listings')
    .select('id, client_id')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) throw new Error(`exemption: no listing ${listingId}`)

  const facts = await listingFacts(listingId)
  const input = {
    listingId,
    basis: String(formData.get('basis') ?? ''),
    declaredBy: String(formData.get('declaredBy') ?? ''),
    recordedBy: who.email,
    alreadyRated: alreadyRated(facts, requirementId),
  }

  const problem = validateExemption(input)
  // Shown, never swallowed. The screen re-renders carrying the sentence.
  if (problem) throw new Error(`exemption:${problem}`)

  await recordExemption({
    clientId: listing.client_id as string,
    listingId,
    requirementId,
    exemption: exemptionRecord(input),
  })

  // The append-only record of the act itself, beside the current value — so
  // "who said this property needed no certificate, and when" survives the value
  // being corrected later.
  await db.from('events').insert({
    client_id: listing.client_id,
    type: 'listing.exemption_declared',
    severity: 'info',
    summary: `${input.declaredBy.trim()} declared this property exempt from certification`,
    data: { listing_id: listingId, requirement_id: requirementId,
            declared_by: input.declaredBy.trim(), basis: input.basis.trim(),
            recorded_by: who.email },
  })

  revalidatePath(`/listings/${listingId}`)
  revalidatePath(`/listings/${listingId}/exemption`)
}
