'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { declareSegment, type Segment } from '@/lib/segmentation/declare'
import { readScreen } from '@/lib/segmentation/read'
import { UI } from '@/lib/segmentation/copy'

/**
 * The one write this screen makes.
 *
 * The operator is taken from the SESSION, never from the form: the person
 * recording is whoever is signed in, and a form field for it would let the two
 * names be set to the same value from the browser — which is the collapse
 * declare.ts exists to refuse.
 *
 * The declarer comes from the form, because only the person in the room can
 * say who at the agency is answering.
 */
/**
 * The outcome is carried back in the URL rather than returned.
 *
 * A form action in a server component must resolve to void, and the obvious
 * consequence — swallow the result — is unacceptable here: declareSegment's
 * refusals carry the reasons a person needs ("the declarer and the recorder are
 * the same name"), and a silent failure IN A MEETING is the worst outcome on
 * this screen. Somebody says a sentence, nothing visibly happens, and everyone
 * assumes it was recorded.
 */
export async function declareGroupAction(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const clientId = String(formData.get('clientId') ?? '')
  const segment = String(formData.get('segment') ?? '') as Segment
  const declaredBy = String(formData.get('declaredBy') ?? '').trim()
  const basis = String(formData.get('basis') ?? '').trim() || null
  const uncertainty = formData.get('uncertainty') === 'on'
  const groupId = String(formData.get('groupId') ?? '')
  const groupLabel = String(formData.get('groupLabel') ?? '')
  const excluded = new Set(formData.getAll('exclude').map(String))

  if (!clientId || !groupId) redirect(`/segmentation/${clientId}?erro=${encodeURIComponent(UI.missingGroup)}`)

  const screen = await readScreen(clientId)
  const chosen = screen.contacts.filter((c) => !excluded.has(c.id))
  const inGroup = chosen.filter((c) => formData.getAll('contact').map(String).includes(c.id))

  if (inGroup.length === 0) {
    redirect(`/segmentation/${clientId}?erro=${encodeURIComponent(UI.noneSelected)}`)
  }

  const result = await declareSegment({
    clientId,
    contacts: inGroup.map((c) => ({ phone: c.phone, leadId: c.id })),
    segment,
    declaredBy,
    recordedBy: operator.email,
    basis,
    uncertainty,
    group: { id: groupId, label: groupLabel, size: inGroup.length },
  })

  if (!result.ok) redirect(`/segmentation/${clientId}?erro=${encodeURIComponent(result.reason)}`)
  revalidatePath(`/segmentation/${clientId}`)
  redirect(`/segmentation/${clientId}?guardado=${result.written}`)
}
