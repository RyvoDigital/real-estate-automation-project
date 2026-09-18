/**
 * The weekly report's figures, and the rule that keeps them honest.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ A PERSON IS COUNTED ONCE IN EVERY CATEGORY THEY GENUINELY BELONG TO,    │
 * │ AND THE REPORT NEVER SUMS CATEGORIES THAT OVERLAP.                      │
 * │                                                                         │
 * │ A reactivated contact who becomes a qualified lead is genuinely both:   │
 * │ they came from the agency's old list AND they are a live enquiry.       │
 * │ Choosing one box understates one automation and overstates the other,   │
 * │ and the client reads that number.                                       │
 * │                                                                         │
 * │ THE LIE ENTERS AT THE SUM. "41 conversations + 12 reactivations = 53    │
 * │ contacts" is false, so reactivations are rendered as a SUBSET line —    │
 * │ indented under the figure they are part of — never as a parallel one.   │
 * │ The shape of the layout carries the logic, because a client reads the   │
 * │ shape.                                                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Pure: it takes rows and returns figures, so every rule is a test.
 */

export type AttributedMessage = {
  leadId: string | null
  attributionState: 'organic' | 'campaign' | 'unknown'
  createdAt: string
}

export type LeadOutcome = {
  leadId: string
  qualified: boolean
  meetingBooked: boolean
}

export type WeeklyFigures = {
  conversations: number
  conversationsFromCampaign: number
  /** Never folded into either figure. A number we do not know is not a zero. */
  conversationsUnattributed: number

  qualified: number
  qualifiedFromCampaign: number

  meetings: number
  meetingsFromCampaign: number

  /** Which lines must be rendered indented under which, by name. */
  subsetOf: Record<string, string>
}

export function weeklyFigures(input: {
  messages: AttributedMessage[]
  outcomes: LeadOutcome[]
}): WeeklyFigures {
  // One conversation per LEAD, not per message. A person who sends six messages
  // is one conversation, and counting messages would inflate every figure in
  // proportion to how talkative somebody was.
  const byLead = new Map<string, 'organic' | 'campaign' | 'unknown'>()
  let unattributedWithoutLead = 0

  for (const m of input.messages) {
    if (!m.leadId) {
      if (m.attributionState === 'unknown') unattributedWithoutLead += 1
      continue
    }
    const seen = byLead.get(m.leadId)
    // `campaign` wins for a lead: if ANY message in the conversation was
    // attributed to a send, the conversation came from it. `unknown` never
    // overwrites a real answer — it is the absence of one.
    if (seen === 'campaign') continue
    if (m.attributionState === 'campaign') byLead.set(m.leadId, 'campaign')
    else if (!seen) byLead.set(m.leadId, m.attributionState)
    else if (seen === 'unknown' && m.attributionState === 'organic') byLead.set(m.leadId, 'organic')
  }

  const fromCampaign = new Set([...byLead].filter(([, s]) => s === 'campaign').map(([id]) => id))
  const unknownLeads = [...byLead].filter(([, s]) => s === 'unknown').length

  const qualified = input.outcomes.filter((o) => o.qualified)
  const meetings = input.outcomes.filter((o) => o.meetingBooked)

  return {
    conversations: byLead.size - unknownLeads,
    conversationsFromCampaign: fromCampaign.size,
    conversationsUnattributed: unknownLeads + unattributedWithoutLead,

    qualified: qualified.length,
    qualifiedFromCampaign: qualified.filter((o) => fromCampaign.has(o.leadId)).length,

    meetings: meetings.length,
    meetingsFromCampaign: meetings.filter((o) => fromCampaign.has(o.leadId)).length,

    subsetOf: {
      conversationsFromCampaign: 'conversations',
      qualifiedFromCampaign: 'qualified',
      meetingsFromCampaign: 'meetings',
    },
  }
}

/**
 * The Portuguese the client reads.
 *
 * Indentation is structural rather than decorative: `subsetOf` says which lines
 * are parts of which, and this renders them that way so no reader can add two
 * numbers that overlap. Nothing is described as "novo" — a reactivated contact
 * is returning, and the agency knows that better than we do.
 */
export function renderWeekly(f: WeeklyFigures): string {
  const pad = (n: number) => String(n).padStart(4)
  const lines = [
    `Conversas recebidas             ${pad(f.conversations)}`,
    `  das quais reactivações        ${pad(f.conversationsFromCampaign)}`,
    '',
    `Contactos qualificados          ${pad(f.qualified)}`,
    `  dos quais reactivados         ${pad(f.qualifiedFromCampaign)}`,
    '',
    `Reuniões marcadas               ${pad(f.meetings)}`,
    `  das quais de reactivação      ${pad(f.meetingsFromCampaign)}`,
  ]
  if (f.conversationsUnattributed > 0) {
    lines.push(
      '',
      `Conversas sem origem determinada ${pad(f.conversationsUnattributed)}`,
      '  (a origem não pôde ser apurada; não entra em nenhum dos números acima)',
    )
  }
  return lines.join('\n')
}
