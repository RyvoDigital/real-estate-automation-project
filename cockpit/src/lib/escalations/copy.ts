/**
 * What /c/<client>/escalations says back after a hand-back (22 Sep 2026). The
 * action sends a KEY; the sentences live here, so nothing the operator typed
 * and nothing about the lead ever travels in a URL.
 */
export const HANDBACK: Record<string, { meaning: 'through' | 'red' | 'grey'; says: string }> = {
  done: { meaning: 'through', says: 'Handed back. The AI will answer this lead’s next message.' },
  doneNoEvent: { meaning: 'red', says: 'Handed back, but the audit event did not write — so the lead is with the AI again and the history does not say who did it. Worth checking before it matters.' },
  notEscalated: { meaning: 'grey', says: 'That lead was not escalated any more — somebody else cleared it while this screen was open. Nothing was changed.' },
  unconfirmed: { meaning: 'grey', says: 'The hand-back was not confirmed, so nothing was changed. Open it again and tick the box.' },
  noLead: { meaning: 'red', says: 'That form did not say which lead, so nothing was changed.' },
  failed: { meaning: 'red', says: 'The hand-back did not go through, and the lead is still with a human. Try again; if it fails twice, the lead screen shows what happened.' },
}
