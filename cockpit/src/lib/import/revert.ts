/**
 * Undoing an import.
 *
 * THE RULE, and it is stricter than "do not cascade":
 *
 *   A revert removes leads. It NEVER deletes a message or an event, under any
 *   circumstances, including for the leads it does remove. Those rows are the
 *   audit trail — the record of what was actually said to a real person — and a
 *   revert that destroys evidence of a conversation is worse than an import
 *   left standing.
 *
 * That is why any lead which has since acquired a message or an event is
 * REFUSED rather than removed, and named in the report.
 *
 * The refusal is load-bearing rather than tidy, because of a detail in the
 * schema: `messages.lead_id` is `on delete set null`. Deleting a lead does not
 * delete its messages — it silently NULLS the link between them. Nothing is
 * "deleted", the row count is unchanged, and the conversation is now evidence
 * with its subject erased. A revert that only refused to cascade would still
 * do that. This one refuses the lead.
 */

export type Retained = {
  id: string
  name: string | null
  reason: string
}

export type RevertPlan = {
  /** Safe to remove: created by this import and untouched since. */
  removable: string[]
  /** Kept, each with the reason the operator can act on. */
  retained: Retained[]
  /** Ids that were in the batch but are no longer leads at all. */
  alreadyGone: string[]
}

export function planRevert(input: {
  /** The ids this import created, from import_batches.created_lead_ids. */
  createdLeadIds: string[]
  /** Ids that still exist as leads, with their names for the report. */
  present: Map<string, string | null>
  /** Ids with at least one row in `messages`. */
  withMessages: Set<string>
  /** Ids appearing as events.data->>'lead_id'. */
  withEvents: Set<string>
}): RevertPlan {
  const removable: string[] = []
  const retained: Retained[] = []
  const alreadyGone: string[] = []

  for (const id of input.createdLeadIds) {
    if (!input.present.has(id)) {
      alreadyGone.push(id)
      continue
    }
    const name = input.present.get(id) ?? null
    const m = input.withMessages.has(id)
    const e = input.withEvents.has(id)

    if (m && e) {
      retained.push({ id, name, reason: 'has messages and events since the import — both are the audit trail' })
    } else if (m) {
      retained.push({ id, name, reason: 'has been messaged since the import — removing the lead would null the link on those messages' })
    } else if (e) {
      retained.push({ id, name, reason: 'has events since the import — the record of what happened stays' })
    } else {
      removable.push(id)
    }
  }

  return { removable, retained, alreadyGone }
}

/** One line the operator reads, which must never overstate what was undone. */
export function describeRevert(plan: RevertPlan): string {
  const parts = [`${plan.removable.length} lead(s) removed`]
  if (plan.retained.length) parts.push(`${plan.retained.length} kept because they have been talked to since`)
  if (plan.alreadyGone.length) parts.push(`${plan.alreadyGone.length} were already gone`)
  parts.push('no message or event was deleted')
  return parts.join(' · ')
}
