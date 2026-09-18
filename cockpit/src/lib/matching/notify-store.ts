import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { runMatchForListing } from './run-store'
import { composeAgentNotification, type ChosenMatch, type NotifiableMatch } from './notify'

/**
 * The agent's match notification, for a listing they have just sent.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE SENDS NOTHING. IT RETURNS A STRING.                           │
 * │                                                                         │
 * │ n8n already replies to the agent inside the 24-hour window their own    │
 * │ message opened (`ReplyToAgent`, live since F2). The cockpit's ingest    │
 * │ endpoint returns the reply text and n8n transmits it. So the            │
 * │ notification is APPENDED to a reply that already happens — no new send  │
 * │ path, no credential here, no template, and no gate, because the gate    │
 * │ governs business-initiated messages and this is a reply.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ UNEXERCISED UNTIL A REAL MATCH EXISTS
 *
 * Today every run refuses for want of thresholds (§4.6), so the only branch of
 * this that has ever executed against real data is the REFUSAL one — which is
 * itself worth sending, because "I could not match this one, and here is what
 * is missing" is actionable and silence is not.
 *
 * The match-carrying branches are exercised by fixtures in
 * `tests/agent-notification.test.ts` and nowhere else. What that proves is the
 * STRUCTURE — which blocks appear, that no phone number is in the text, that a
 * chosen row never borrows a computed row's authority. What it cannot prove is
 * whether an agent would act on it, which is F4's actual gate and needs the
 * calibration conversation.
 *
 * ⚠️ ALSO UNEXERCISED: THE OUTSIDE-THE-WINDOW PATH.
 *
 * A listing entered in the cockpit, a re-match after a status change, a sweep
 * over new leads — none of those ride an open window, and the decision recorded
 * in the design is that they get NO WhatsApp push at all: the cockpit carries
 * them, and the email transport carries a digest. Neither entry point exists
 * yet, so `notificationFor` is only ever called from the ingest reply. When one
 * does, the thing NOT to reach for is a template — its Meta category is a real
 * question and the penalty for getting it wrong lands on the client's account.
 *
 * The expected failure if somebody tries a free-form push outside the window is
 * Twilio 63016, "Failed to send freeform message because you are outside the
 * allowed window". `AfterAgentReply` already asserts the Twilio response rather
 * than trusting a 2xx, so it surfaces as a named error and not as silence.
 */

/** Whole months between two instants, or null when there is no earlier one. */
function monthsSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44)))
}

export async function notificationFor(input: {
  clientId: string
  listingId: string
}): Promise<{ text: string; ran: boolean; named: number }> {
  const outcome = await runMatchForListing(input)
  const db = admin()

  const { data: listing } = await db
    .from('listings')
    .select('reference, area, price')
    .eq('id', input.listingId)
    .maybeSingle()

  const shape = {
    reference: (listing?.reference as string) ?? null,
    area: (listing?.area as string) ?? null,
    price: (listing?.price as number) ?? null,
  }

  if (!outcome.ran) {
    const note = composeAgentNotification({
      listing: shape,
      plan: { ran: false, refusal: outcome.refusal },
      matches: [],
      chosen: [],
    })
    return { text: note.text, ran: false, named: 0 }
  }

  // Names for the leads the run matched, and for any the agent chose. One
  // query, in plan order — the run already sorted them strongest first and
  // "which ones did it find" must not be re-ordered by a database.
  const leadIds = [...outcome.plan.matches.map((m) => m.leadId)]
  const { data: chosenRows } = await db
    .from('listing_matches')
    .select('lead_id, chosen_by, chosen_reason')
    .eq('listing_id', input.listingId)
    .eq('origin', 'agent')
    .is('superseded_at', null)
  for (const c of chosenRows ?? []) leadIds.push(c.lead_id as string)

  const { data: leads } = leadIds.length
    ? await db.from('leads').select('id, full_name, last_contact_at').in('id', leadIds)
    : { data: [] as { id: string; full_name: string | null; last_contact_at: string | null }[] }

  const byId = new Map((leads ?? []).map((l) => [l.id as string, l]))

  const matches: NotifiableMatch[] = outcome.plan.matches.flatMap((m) => {
    const l = byId.get(m.leadId)
    // A lead we cannot name is DROPPED from the text rather than rendered as
    // "someone". An agent cannot act on an unnamed match, and a placeholder in
    // a message they forward is worse than one fewer line.
    if (!l?.full_name) return []
    return [{
      leadId: m.leadId,
      name: l.full_name,
      monthsSinceContact: monthsSince(l.last_contact_at ?? null),
      strength: m.strength,
      filterWouldFind: m.filterWouldFind,
      reasons: m.reasoning.reasons,
    }]
  })

  const chosen: ChosenMatch[] = (chosenRows ?? []).flatMap((c) => {
    const l = byId.get(c.lead_id as string)
    if (!l?.full_name) return []
    return [{
      leadId: c.lead_id as string,
      name: l.full_name,
      chosenBy: (c.chosen_by as string) ?? 'the agency',
      chosenReason: (c.chosen_reason as string) ?? null,
    }]
  })

  const note = composeAgentNotification({ listing: shape, plan: outcome.plan, matches, chosen })
  return { text: note.text, ran: true, named: note.named }
}
