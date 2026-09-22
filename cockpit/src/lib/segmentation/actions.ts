'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { declareSegment } from '@/lib/segmentation/declare'
import { resolveDeclaration } from '@/lib/segmentation/declare-core'
import { readScreen } from '@/lib/segmentation/read'
import { proposeGroups } from '@/lib/segmentation/groups'
import { refusalQuery } from '@/lib/refusals'

/**
 * The one write this screen makes. It parses the form and nothing more: every
 * rule is in declare-core.ts (resolveDeclaration, then declareSegment).
 *
 * The operator is taken from the SESSION, never from the form: the person
 * recording is whoever is signed in, and a form field for it would let the two
 * names be set to the same value from the browser — which is the collapse
 * declare-core.ts exists to refuse.
 *
 * The declarer comes from the form, because only the person in the room can
 * say who at the agency is answering. The group's members and label come from
 * the server's own reading, never from the form (checkpoint 1, 22 Sep 2026).
 *
 * The outcome is carried back in the URL rather than returned. A form action in
 * a server component must resolve to void, and swallowing the result is
 * unacceptable here: the refusals carry the reasons a person needs, and a silent
 * failure IN A MEETING is the worst outcome on this screen. Somebody says a
 * sentence, nothing visibly happens, and everyone assumes it was recorded.
 */
export async function declareGroupAction(formData: FormData): Promise<void> {
  const operator = await requireOperator()

  const text = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v : null
  }
  const clientId = text('clientId') ?? ''
  const groupId = text('groupId') ?? ''
  if (!clientId || !groupId) redirect(`/segmentation/${clientId}?${refusalQuery({ key: 'missingGroup' })}`)

  const screen = await readScreen(clientId)
  const resolved = resolveDeclaration(
    {
      clientId,
      groupId,
      segment: text('segment'),
      declaredBy: text('declaredBy'),
      basis: text('basis'),
      uncertainty: text('uncertainty'),
      declarationId: text('declarationId'),
      contacts: formData.getAll('contact').map(String),
      excluded: formData.getAll('exclude').map(String),
    },
    { groups: proposeGroups(screen.contacts), contacts: screen.contacts },
    operator.email,
  )
  // The KEY travels, never a sentence: the screen says it in the agency's language.
  if (!resolved.ok) redirect(`/segmentation/${clientId}?${refusalQuery(resolved.refusal)}`)

  const result = await declareSegment(resolved.input)
  if (!result.ok) redirect(`/segmentation/${clientId}?${refusalQuery(result.refusal)}`)
  revalidatePath(`/segmentation/${clientId}`)
  // The same form again is not an error: the first submit is the record (0055).
  if (result.alreadyRecorded) redirect(`/segmentation/${clientId}?jaGuardado=1`)
  redirect(`/segmentation/${clientId}?guardado=${result.written}`)
}
