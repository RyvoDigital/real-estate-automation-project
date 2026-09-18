import { matchSend, findOrphans, type ProviderMessage, type UnresolvedRow } from '@/lib/send/match'

/**
 * Reconciliation. Two passes, and NEITHER MAY SEND.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE NEVER RE-DISPATCHES. NOT ONCE, NOT WITH A FLAG.               │
 * │                                                                         │
 * │ Twilio has no idempotency on message creation, so a re-send after an    │
 * │ unresolved row is a coin flip on a second message to somebody whose     │
 * │ consent is the entire product. Rows it can resolve, it resolves; rows   │
 * │ it cannot go to a human.                                                │
 * │                                                                         │
 * │ It does not import dispatch, permit, or the adapter, and it holds only  │
 * │ the READ credential — through the reader it is handed. There is no send │
 * │ available to it even if this text were deleted.                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Both passes take their store and their reader as arguments, so every case is
 * testable with fakes and no network — the same split that made dispatch
 * testable after `server-only` bit twice (engineering-lessons §12).
 */

/** Only rows older than this are examined: a request in flight has not failed. */
export const GRACE_MS = 10 * 60 * 1000

export type PendingRow = {
  id: string
  clientId: string
  clientNumber: string
  phoneE164: string
  bodyIntended: string | null
  intentRecordedAt: string
  status: 'intended' | 'unresolved'
}

export type ReconcileStore = {
  pending(olderThan: Date): Promise<PendingRow[]>
  complete(id: string, patch: {
    status: 'sent'
    provider_message_id: string
    body_sent: string
    sent_at: string
    reconciled_at: string
  }): Promise<void>
  markUnresolved(id: string, patch: { reconciled_at: string; last_error: string }): Promise<void>
}

export type ProviderReader = {
  listMessages(params: {
    from: string; to?: string; sentAfter: Date; sentBefore: Date
  }): Promise<ProviderMessage[]>
}

export type ReconcileOutcome = {
  examined: number
  completed: number
  unresolved: number
  /** Needs a human NOW: the same body went out more than once. */
  alerts: Array<{ sendId: string; kind: 'duplicate_send'; detail: string }>
}

export async function reconcilePending(deps: {
  store: ReconcileStore
  reader: ProviderReader
  now?: Date
}): Promise<ReconcileOutcome> {
  const now = deps.now ?? new Date()
  const rows = await deps.store.pending(new Date(now.getTime() - GRACE_MS))
  const out: ReconcileOutcome = { examined: rows.length, completed: 0, unresolved: 0, alerts: [] }

  for (const row of rows) {
    const t = new Date(row.intentRecordedAt).getTime()

    if (!row.bodyIntended) {
      // Without the body there is no discriminator, and recipient-plus-window
      // alone would match a Concierge reply. Refusing to guess is the only
      // option: a wrong match writes a false record in a regulatory table.
      await deps.store.markUnresolved(row.id, {
        reconciled_at: now.toISOString(),
        last_error:
          'No body_intended on this row, so it cannot be matched: recipient and window alone ' +
          'would match a Concierge reply. Resolve by hand.',
      })
      out.unresolved += 1
      continue
    }

    const messages = await deps.reader.listMessages({
      from: row.clientNumber,
      to: row.phoneE164,
      sentAfter: new Date(t - 5 * 60 * 1000),
      sentBefore: new Date(t + 20 * 60 * 1000),
    })

    const unresolved: UnresolvedRow = {
      phoneE164: row.phoneE164,
      clientNumber: row.clientNumber,
      bodyIntended: row.bodyIntended,
      intentRecordedAt: row.intentRecordedAt,
    }
    const result = matchSend(unresolved, messages)

    if (result.kind === 'resolved') {
      await deps.store.complete(row.id, {
        status: 'sent',
        provider_message_id: result.message.sid,
        // From the provider's copy, not ours: the wire is the artefact.
        body_sent: result.message.body,
        sent_at: result.message.dateSent,
        reconciled_at: now.toISOString(),
      })
      out.completed += 1
      continue
    }

    if (result.kind === 'ambiguous') {
      // Not resolved automatically. If the same body went out twice the
      // never-retry rule broke somewhere, which is a bigger fact than this row.
      await deps.store.markUnresolved(row.id, {
        reconciled_at: now.toISOString(),
        last_error: result.detail,
      })
      out.unresolved += 1
      out.alerts.push({ sendId: row.id, kind: 'duplicate_send', detail: result.detail })
      continue
    }

    await deps.store.markUnresolved(row.id, {
      reconciled_at: now.toISOString(),
      last_error: result.detail,
    })
    out.unresolved += 1
  }

  return out
}

// ---------------------------------------------------------------------------
// The orphan sweep: the same listing read backwards.
// ---------------------------------------------------------------------------

export type OrphanOutcome = {
  clientId: string
  examined: number
  orphans: ProviderMessage[]
  /** An orphan means the gate is not the only route. Halt everything. */
  halt: boolean
  detail: string
}

/**
 * An outbound message with no send row, shaped like a template we send.
 *
 * Free-form messages are the Concierge replying inside the window a lead
 * opened: expected, constant, and NOT orphans. An alert that fires every few
 * minutes is switched off within a week (§9).
 */
export async function sweepOrphans(deps: {
  clientId: string
  clientNumber: string
  reader: ProviderReader
  knownProviderIds: ReadonlySet<string>
  looksLikeTemplate: (body: string) => boolean
  since: Date
  until?: Date
}): Promise<OrphanOutcome> {
  const messages = await deps.reader.listMessages({
    from: deps.clientNumber,
    sentAfter: deps.since,
    sentBefore: deps.until ?? new Date(),
  })
  const orphans = findOrphans({
    messages,
    knownProviderIds: deps.knownProviderIds,
    looksLikeTemplate: deps.looksLikeTemplate,
  })

  return {
    clientId: deps.clientId,
    examined: messages.length,
    orphans,
    halt: orphans.length > 0,
    detail: orphans.length
      ? `${orphans.length} outbound message(s) match a template shape and have no send row. ` +
        'Something sent outside the gate: halt every campaign for this client and do not resume ' +
        'until a person has established what sent them. Unlike the objection race, this is not a ' +
        'bounded failure — it means the gate is not the only route.'
      : `${messages.length} outbound message(s) examined, all accounted for.`,
  }
}

/**
 * The template test, from the real vocabulary.
 *
 * REPLACES `templateMatcherFromSends`, which worked from bodies we had sent
 * before. That was the best available signal while message_templates did not
 * exist, and it had a hole recorded beside it: a NOVEL template sent outside the
 * gate was invisible, because a body never sent could not be in the set of
 * bodies sent. Deleted rather than left beside the real one — two matchers for
 * one question is how the weaker gets called by accident.
 *
 * What remains uncovered is now much smaller and worth naming precisely: a
 * template sent outside the gate that was never RECORDED here. Recording is an
 * operator action, so the gap is "somebody submitted and used a template without
 * writing it down", not "somebody invented a template".
 */
export function templateMatcher(vocabulary: {
  matches: (body: string) => string | null
}): (body: string) => boolean {
  return (body: string) => vocabulary.matches(body) !== null
}
