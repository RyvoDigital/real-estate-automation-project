/**
 * Taking in a close, and taking in who to ask. Pure.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE CLOSE AND THE PARTY ARRIVE SEPARATELY, AND ALMOST ALWAYS WILL.      │
 * │                                                                         │
 * │ An agent sends "A-1042 vendido" because it takes the listing out of     │
 * │ matching — a message they already have a reason to send, about a        │
 * │ property. It says nothing about a person, and it never will.            │
 * │                                                                         │
 * │ So a close is born with no party, we ask who, and the answer is a       │
 * │ second act by a second person at a second time. Modelling it as one     │
 * │ act would mean either inventing a party or discarding the close.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * §3.2: the trigger carries who, and if the agent does not say, nothing is
 * asked. This file is the half that records the asking.
 */

export type CloseReport = {
  clientId: string
  /** Null when the sale is of a property that was never in the system. */
  listingId: string | null
  /** The legal date of the transaction. Every window is measured from it. */
  closedOn: string
  reportedBy: string
  source: 'whatsapp' | 'cockpit'
  rawMessage: string | null
}

export type PartyDeclaration = {
  closeId: string
  leadId: string
  role: 'buyer' | 'seller'
  /** The person AT THE AGENCY who says so. */
  declaredBy: string
  /** Us. Recorded, never conflated with the declarer. */
  recordedBy: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function validateCloseReport(r: CloseReport, today: string): string | null {
  if (!DATE.test(r.closedOn)) {
    return 'A close needs the date the sale completed, as YYYY-MM-DD. Every window in this ' +
      'automation is measured from it, so it is not something to approximate.'
  }
  // The same rule the CHECK constraint holds, said here where somebody can read
  // it before the database refuses them with a constraint name.
  if (r.closedOn > today) {
    return 'That date is in the future. A sale that has not completed is not a close, and a ' +
      'close dated forward would sit waiting for a window that never opens.'
  }
  if (!r.reportedBy.trim()) {
    return 'Record who reported this. A sale that arrived from nobody cannot be asked about ' +
      'later, and it is the first thing anyone will want to know.'
  }
  return null
}

/**
 * ⚠️ THE AGENCY DECLARES AND WE RECORD — never the same person.
 *
 * The segmentation screen's rule, and it applies here for a sharper reason than
 * it does there: naming the party to a completed transaction IS the segment A
 * declaration (§3.4), and segment A is a lawful basis. If we could be both the
 * declarer and the recorder, this system would be manufacturing its own
 * permission to send.
 */
export function validatePartyDeclaration(d: PartyDeclaration): string | null {
  if (!d.leadId) {
    return 'Choose the person to be asked. This is not inferred from the property — a sale has ' +
      'two parties and which of them the agency has a relationship with varies by sale.'
  }
  if (d.role !== 'buyer' && d.role !== 'seller') {
    return 'Say whether this person bought or sold. It is on the record because it is the ' +
      'agency’s statement about their own client, not our reading of one.'
  }
  if (!d.declaredBy.trim()) {
    return 'Record the name of the person at the agency who says this. Naming the party to a ' +
      'completed sale is a statement about a lawful basis, and a statement needs somebody ' +
      'who made it.'
  }
  if (!d.recordedBy.trim()) {
    return 'Record who is entering this.'
  }
  if (d.declaredBy.trim().toLowerCase() === d.recordedBy.trim().toLowerCase()) {
    return 'The declarer and the recorder cannot be the same person. The agency says who their ' +
      'client was; we write it down. If those are one person, the system is producing its own ' +
      'permission to send.'
  }
  return null
}

/**
 * The stored form of a declaration.
 *
 * ⚠️ `at` IS SET HERE, so nobody can pass a date they chose. Same as
 * `exemptionRecord`: a declaration backdated by the person making it is not a
 * record of when it was made.
 */
export function partyRecord(d: PartyDeclaration, now: Date = new Date()): {
  lead_id: string
  role: 'buyer' | 'seller'
  declared_by: string
  recorded_by: string
  at: string
} {
  return {
    lead_id: d.leadId,
    role: d.role,
    declared_by: d.declaredBy.trim(),
    recorded_by: d.recordedBy.trim(),
    at: now.toISOString(),
  }
}

/**
 * What we send the agent when a close arrives with no party.
 *
 * ⚠️ IT OFFERS NO DEFAULT AND NAMES NOBODY. Proposing "was it the buyer?" would
 * collect a tap rather than an answer, and the tap would be recorded as the
 * agency's statement about which of their own clients to approach. §4.6's rule
 * about pre-filled fields, in a message instead of a form.
 *
 * And it says what happens if they do not reply, because the honest answer —
 * nothing gets asked — is also the one most likely to produce a reply.
 */
export function whoToAskPrompt(reference: string | null): string {
  const what = reference ? `de ${reference}` : 'desta venda'
  return (
    `Quem devemos contactar a propósito ${what} — o comprador ou o vendedor? ` +
    'Responda com o nome da pessoa. Se não nos disser, não pedimos opinião a ninguém.'
  )
}
