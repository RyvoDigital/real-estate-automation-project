import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { resolveJurisdiction } from '@/lib/jurisdiction'

/**
 * Suppression: reading whether a contact has objected, and recording that they
 * have.
 *
 * TWO ACTIONS, ONE OF THEM PERMANENT (src/opt_out.js has the full reasoning).
 * `recordObjection` is the irreversible half. It is only ever called on an
 * unambiguous opt-out or a platform block — never on `unclear`, which halts and
 * escalates and writes nothing.
 *
 * The read goes through `consent_by_contact`, keyed on the phone, NEVER through
 * `leads_consent`: an objection outlives the lead row that carried it, and
 * asking the lead-shaped view would miss exactly the contacts who most need to
 * be missed.
 */

export type ObjectionSource = 'whatsapp_reply' | 'meta_block' | 'operator'

/**
 * The last resort: a number the resolver cannot classify but the ledger can
 * hold. Deliberately only what `consent_events`'s CHECK constraint accepts, so
 * a value that passes here cannot fail at the database.
 */
function syntacticE164(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').replace(/[\s()-]/g, '').replace(/^00/, '+')
  return /^\+[1-9][0-9]{6,14}$/.test(s) ? s : null
}

export async function isSuppressed(clientId: string, phone: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('consent_by_contact')
    .select('state')
    .eq('client_id', clientId)
    .eq('phone_e164', phone)
    .maybeSingle()
  if (error) throw new Error(`suppression read failed: ${error.message}`)
  return data?.state === 'objected'
}

export async function recordObjection(input: {
  clientId: string
  phone: string
  source: ObjectionSource
  /** The exact text the person sent. It is the evidence, so it is stored verbatim. */
  wording?: string | null
  /** What in that text fired, from optOutVerdict().matched. */
  matched?: string | null
  occurredAt?: string | null
  leadId?: string | null
}): Promise<{ id: string; alreadySuppressed: boolean }> {
  // An objection must be recordable from ANY number we can store, even one the
  // resolver cannot classify. The asymmetry is one-way and obvious once stated:
  // refusing to record an objection means continuing to message the person who
  // asked us to stop. So an unresolvable jurisdiction becomes a null column on
  // the row, never a refusal to record.
  //
  // This started as `if (!resolveJurisdiction(...).ok) throw`, which would have
  // dropped the objection of anyone whose number libphonenumber dislikes.
  const j = resolveJurisdiction(input.phone)
  const e164 = j.ok || j.reason === 'no_country' ? j.e164 : syntacticE164(input.phone)
  if (!e164) {
    // Nothing storable at all. Loud, because an objection that vanishes
    // silently is the one outcome that must never happen quietly.
    throw new Error(
      `cannot record an objection for "${input.phone}": no storable E.164 form. ` +
      'The ledger is keyed on the phone, so an unkeyable objection could never be ' +
      'enforced — handle this by hand rather than letting it disappear.',
    )
  }

  const already = await isSuppressed(input.clientId, e164)

  // Recorded even when already suppressed. Append-only means the second
  // objection is a second fact -- they told us twice -- and the count of times
  // someone had to ask is worth having rather than deduplicating away.
  const { data, error } = await admin()
    .from('consent_events')
    .insert({
      client_id: input.clientId,
      phone_e164: e164,
      lead_id: input.leadId ?? null,
      kind: 'objection',
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      source: input.source,
      wording: input.wording ?? null,
      evidence: { matched: input.matched ?? null, already_suppressed: already },
      jurisdiction: j.ok ? j.country : null,
      note:
        input.source === 'meta_block'
          ? 'Platform reported the contact blocked the number. Treated as an objection (Enquadramento §7).'
          : 'Opt-out recognised in the contact\'s own message. Permanent and across campaigns.',
    })
    .select('id')
    .single()
  if (error) throw new Error(`objection insert failed: ${error.message}`)

  return { id: data!.id as string, alreadySuppressed: already }
}
