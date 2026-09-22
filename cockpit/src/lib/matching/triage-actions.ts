'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { admin } from '@/lib/supabase/admin'
import { requireOperator } from '@/lib/auth'
import { recordPick, type PickDeps } from './pick-core'
import { refusalQuery } from '@/lib/refusals'

/**
 * The agent picks somebody for this listing. It parses the form and nothing
 * more: the rules are in pick-core.ts, and the write is record_agent_pick
 * (0057) — the match, the requirements its sentence taught and the event, or
 * none.
 *
 * THE AGENCY DECIDES; WE RECORD: `chosen_by` is typed, the recorder is the
 * session. The outcome goes back in the URL, never as a throw.
 */
const deps: PickDeps = {
  /** The areas this listing's agency's buyers actually talk about (§4.3), never a gazetteer. A failed read is null. */
  knownAreas: async (listingId) => {
    const db = admin()
    const { data: listing, error: lErr } = await db.from('listings').select('client_id').eq('id', listingId).maybeSingle()
    if (lErr || !listing) return null
    const { data, error } = await db.from('client_automations').select('config').eq('client_id', listing.client_id as string)
    if (error) return null
    const areas = new Set<string>()
    for (const r of (data ?? []) as { config: Record<string, unknown> | null }[]) {
      const cfg = r.config ?? {}
      for (const a of ((cfg.areas as string[]) ?? [])) areas.add(String(a))
      for (const a of (((cfg.listing_ingest ?? {}) as { areas?: string[] }).areas ?? [])) areas.add(String(a))
    }
    return [...areas]
  },
  currentChooser: async (listingId, leadId) => {
    const { data, error } = await admin().from('listing_matches').select('chosen_by')
      .eq('listing_id', listingId).eq('lead_id', leadId).is('superseded_at', null).maybeSingle()
    return error ? null : ((data?.chosen_by as string | null) ?? null)
  },
  record: async (args) => {
    const { data, error } = await admin().rpc('record_agent_pick', args)
    return { data: (data as string | null) ?? null, error: error ? { code: error.code ?? null, message: error.message } : null }
  },
}

export async function pickForListingAction(formData: FormData): Promise<void> {
  const who = await requireOperator()
  const text = (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v : null }
  const listingId = text('listingId') ?? ''
  const back = `/listings/${listingId}/triage`

  const result = await recordPick({
    pickId: text('pickId'), listingId, leadId: text('leadId'), chosenBy: text('declaredBy'), reason: text('reason'),
  }, who.email, deps)

  // The KEY travels, never a sentence: the screen says it in the agency's language.
  if (!result.ok) redirect(`${back}?${refusalQuery(result.refusal)}`)
  revalidatePath(back)
  revalidatePath(`/listings/${listingId}`)
  redirect(`${back}?${result.alreadyRecorded ? 'jaGuardado' : 'guardado'}=1`)
}
