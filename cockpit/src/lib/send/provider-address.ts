/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE WRITING ANY QUERY AGAINST THE MESSAGE PROVIDER.
 *
 *  TWILIO ADDRESSES WHATSAPP WITH A CHANNEL PREFIX. WE STORE BARE E.164.
 *
 *      provider   whatsapp:+351912345678
 *      us         +351912345678          (leads.phone, consent_events.phone_e164,
 *                                          sends.phone_e164 — everywhere)
 *
 *  A query built from our form returns SUCCESS AND NOTHING:
 *
 *      From=+14155238886            200   0 message(s)
 *      From=whatsapp:+14155238886   200   5 message(s)
 *
 *  Both are HTTP 200. The wrong one is not an error, a warning, or a retry —
 *  it is a clean, confident, permanently empty answer, and every consumer
 *  downstream reads it as "nothing was sent".
 *
 *  ON 17 SEPTEMBER 2026 THAT COST TWO SUBSYSTEMS AT ONCE, from one root cause,
 *  neither failing loudly:
 *
 *    · the orphan sweep would have reported "all accounted for" every night
 *      while examining nothing — on the one check whose job is detecting a
 *      message sent outside the gate
 *    · matchSend compares the provider's `to` against sends.phone_e164, so
 *      every reconciled row would have gone `unresolved` for ever
 *
 *  It was found by a dry run that printed its query beside its result, before
 *  anything was scheduled. See engineering-lessons §5d.
 *
 *  THE RULE: the channel prefix lives HERE, at the boundary. Queries go out
 *  through `toChannelAddress`, results come back through `stripChannelAddress`,
 *  and every other module in this repository speaks bare E.164 and never sees
 *  a prefix. If you are adding a second place that talks to the provider, it
 *  uses these two functions; it does not re-derive the format.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dependency-free on purpose: nothing here should ever be a reason a module
 * cannot import it.
 */

export const CHANNEL = 'whatsapp'

/** Our form → the provider's. Idempotent, so double-prefixing is impossible. */
export function toChannelAddress(e164: string, channel: string = CHANNEL): string {
  return e164.startsWith(`${channel}:`) ? e164 : `${channel}:${e164}`
}

/** The provider's form → ours. A bare number survives unchanged. */
export function stripChannelAddress(addr: string): string {
  const i = addr.indexOf(':')
  return i === -1 ? addr : addr.slice(i + 1)
}
