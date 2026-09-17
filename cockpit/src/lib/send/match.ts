/**
 * Matching an unresolved send against the provider's own message list.
 *
 * Pure: a row, a list of messages, a verdict. No network, no database, so every
 * case below is testable — including the one that matters most.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE CONCIERGE IS INSIDE THE SEARCH WINDOW.                              │
 * │                                                                         │
 * │ The only lookup Twilio offers is To + From + a DateSent range: there is  │
 * │ no idempotency key on the Messages resource (checked 17 Sep 2026). That  │
 * │ query also matches the Concierge's own replies — the same WhatsApp       │
 * │ number serves both, and a reactivation contact who answers gets a reply  │
 * │ within seconds, inside the very window being searched.                   │
 * │                                                                         │
 * │ So matching on recipient and time alone would complete a send row with   │
 * │ the provider id of a conversational reply, and the record would claim a  │
 * │ marketing template went out when what went out was "Claro, qual é o seu  │
 * │ horizonte temporal?" — a false record in the one table whose purpose is  │
 * │ answering a regulator.                                                   │
 * │                                                                         │
 * │ THE BODY IS THE DISCRIMINATOR AND IT MUST MATCH EXACTLY. body_intended   │
 * │ is fully rendered, variables substituted, so an exact comparison is      │
 * │ available and a fuzzy one is never needed. Anything less is refused.     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Direction does NOT discriminate: the Concierge sends through the same REST
 * API, so its replies are `outbound-api` exactly as a campaign message is.
 * Noted because it is the filter one reaches for first and it does nothing.
 */

export type ProviderMessage = {
  sid: string
  to: string
  from: string
  body: string
  dateSent: string
  direction?: string
  status?: string
}

export type UnresolvedRow = {
  phoneE164: string
  clientNumber: string
  bodyIntended: string
  intentRecordedAt: string
}

/** How many candidates survived each filter. An unresolved result must say WHY. */
export type MatchDiagnosis = {
  listed: number
  toRecipient: number
  inWindow: number
  bodyExact: number
  /** Exact body, wrong time: our window may be wrong, which is worth knowing. */
  bodyExactOutsideWindow: number
}

export type MatchResult =
  | { kind: 'resolved'; message: ProviderMessage; diagnosis: MatchDiagnosis }
  | { kind: 'unresolved'; detail: string; diagnosis: MatchDiagnosis }
  | { kind: 'ambiguous'; messages: ProviderMessage[]; detail: string; diagnosis: MatchDiagnosis }

/** Generous before, to allow clock skew; generous after, because a slow accept still lands. */
export const WINDOW_BEFORE_MS = 2 * 60 * 1000
export const WINDOW_AFTER_MS = 15 * 60 * 1000

export function matchSend(row: UnresolvedRow, messages: ProviderMessage[]): MatchResult {
  const t = new Date(row.intentRecordedAt).getTime()
  const from = t - WINDOW_BEFORE_MS
  const to = t + WINDOW_AFTER_MS

  const toRecipient = messages.filter(
    (m) => m.to === row.phoneE164 && m.from === row.clientNumber,
  )
  const inWindow = toRecipient.filter((m) => {
    const d = new Date(m.dateSent).getTime()
    return Number.isFinite(d) && d >= from && d <= to
  })
  // Exact. Not trimmed, not normalised, not case-folded: the cost of a wrong
  // match is a false record in a regulatory table.
  const bodyExact = inWindow.filter((m) => m.body === row.bodyIntended)
  const bodyExactOutsideWindow = toRecipient.filter(
    (m) => m.body === row.bodyIntended && !inWindow.includes(m),
  )

  const diagnosis: MatchDiagnosis = {
    listed: messages.length,
    toRecipient: toRecipient.length,
    inWindow: inWindow.length,
    bodyExact: bodyExact.length,
    bodyExactOutsideWindow: bodyExactOutsideWindow.length,
  }

  if (bodyExact.length === 1) {
    return { kind: 'resolved', message: bodyExact[0], diagnosis }
  }

  if (bodyExact.length > 1) {
    // We sent twice. That is a bigger fact than the row it was found in: the
    // never-retry rule broke somewhere, and no automatic resolution is
    // appropriate for a record that two messages exist where one was intended.
    return {
      kind: 'ambiguous',
      messages: bodyExact,
      detail:
        `${bodyExact.length} messages with exactly this body were sent to ${row.phoneE164} ` +
        'in the window. The message went out more than once, which means the never-retry rule ' +
        'was broken somewhere. Do not resolve this row automatically.',
      diagnosis,
    }
  }

  // Nothing matched. Say which kind of nothing (§5b).
  let detail: string
  if (diagnosis.bodyExactOutsideWindow > 0) {
    detail =
      `No match inside the window, but ${diagnosis.bodyExactOutsideWindow} message(s) with exactly ` +
      'this body were sent to this contact outside it. The window is probably wrong, not the send.'
  } else if (diagnosis.inWindow > 0) {
    detail =
      `${diagnosis.inWindow} message(s) went to this contact in the window and none carried this ` +
      'body — almost certainly Concierge replies, which share the number. The template was not sent.'
  } else if (diagnosis.toRecipient > 0) {
    detail =
      `${diagnosis.toRecipient} message(s) have gone to this contact, none in the window. ` +
      'Nothing was sent for this row.'
  } else if (diagnosis.listed === 0) {
    // The listing came back EMPTY, which is not the same fact as "nothing was
    // sent to this contact". An empty provider response can also mean the query
    // was wrong, the window was malformed, or the credential reached the wrong
    // account — and every one of those would look like a clean "no send" and be
    // recorded as one. §5b: an empty result is a claim about the query until
    // something proves otherwise.
    detail =
      'The provider returned NO messages at all for this window — not merely none to this ' +
      'contact. That is as likely to be a broken listing as an absence of sends: check the ' +
      'query, the window and the account before treating this row as unsent.'
  } else {
    detail =
      `The provider listed ${diagnosis.listed} message(s) in this window and none went to ` +
      `${row.phoneE164} from ${row.clientNumber}. Nothing was sent for this row.`
  }
  return { kind: 'unresolved', detail, diagnosis }
}

/**
 * Half two, read in the other direction: an outbound message with no send row.
 *
 * An orphan means something sent outside the gate, which is the one event the
 * architecture exists to make impossible. Free-form messages are the
 * Concierge's replies and are expected; a message shaped like an approved
 * template is not.
 *
 * `looksLikeTemplate` is supplied by the caller from the approved template
 * bodies, so this stays pure and the template set can change without touching
 * the rule.
 */
export function findOrphans(input: {
  messages: ProviderMessage[]
  knownProviderIds: ReadonlySet<string>
  looksLikeTemplate: (body: string) => boolean
}): ProviderMessage[] {
  return input.messages.filter(
    (m) => !input.knownProviderIds.has(m.sid) && input.looksLikeTemplate(m.body),
  )
}
