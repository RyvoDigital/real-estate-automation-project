/**
 * The onboarding checklist for one client: brief §2.8, /onboarding checkpoint 2.
 *
 * PURE: facts in, a checklist out. The reads are in ./onboarding-read.ts, and
 * tests/onboarding-checklist.test.ts drives every state.
 *
 *   🔴 No "onboarded" state while anything is outstanding. A checklist showing an
 *      item as outstanding is honest; one that omits it implies a client is ready
 *      when nothing may yet be sent to anybody. The headline names every
 *      outstanding step, and the two agency conversations by name.
 *   🔒 A step whose fact could not be READ is "unknown", never done and never
 *      outstanding: a failed read that looked like "not yet" would send the
 *      operator to redo a conversation that happened, and one that looked like
 *      "done" would onboard a client on no evidence.
 *   🔒 The declaration and the calibration are the AGENCY's assertions, made in
 *      their name on their own screens. Here they are only read and linked to,
 *      never recorded (brief §2.8, "Cannot do").
 *   🔒 THE CALIBRATION APPLIES ONLY WHERE AUTOMATION 03 WAS SOLD (operator,
 *      22 Sep 2026). "Sold" is read from the CONTRACT, never from an automation
 *      row existing (0056 creates that row disabled at a first calibration):
 *      a contract in force (not corrected, not ended by today) whose
 *      `automations` includes lead_nurture. `nurtureSoldFrom` below decides it.
 *        sold                          the step applies: done or outstanding
 *        a contract, nurture not in it  not applicable: never outstanding
 *        no contract in force           unknown: what was sold is not recorded
 *        the contracts unread           unknown
 */

export type StepKey = 'agency' | 'routing' | 'disclosure' | 'declaration' | 'calibration'
export type StepState = 'done' | 'outstanding' | 'unknown' | 'not_applicable'

export type Step = {
  key: StepKey
  title: string
  /** what kind of thing it is: filled in here, proved here, or a conversation held elsewhere */
  kind: 'form' | 'proof' | 'conversation'
  state: StepState
  /** the day it happened, when done */
  on: string | null
  /** one line: who, or what is still needed */
  line: string
  /** where it is done, when that is not this screen */
  href: string | null
}

export type ChecklistInputs = {
  client: { id: string; name: string; rehearsal: boolean; createdOn: string }
  /** null = the records could not be read; 'not_migrated' = 0054 is not applied yet */
  records: { step: 'routing_proved' | 'ai_disclosure_told'; happenedOn: string; recordedBy: string; detail: Record<string, unknown> }[] | null | 'not_migrated'
  /** the day the first contact declaration was made; null = none; undefined = the read failed */
  declaredOn: string | null | undefined
  /** the day the calibration was recorded; null = none; undefined = the read failed */
  calibratedOn: string | null | undefined
  /** from the contract (nurtureSoldFrom): true sold; false a contract without it; null no contract in force; undefined the read failed */
  nurtureSold: boolean | null | undefined
  /** names for the routing proof's other half */
  clientNames: Map<string, string>
}

export type Checklist = {
  steps: Step[]
  onboarded: boolean
  outstanding: Step[]
  unknown: Step[]
  headline: string
}

const one = <T,>(xs: T[]): T | null => xs[xs.length - 1] ?? null

/** One contract, as nurtureSoldFrom reads it (client_contracts_uncorrected: corrections already dropped). */
export type ContractFact = { automations: string[] | null; endsOn: string | null }

/**
 * Was automation 03 sold to this client, by its contracts IN FORCE today?
 * A contract that has ended does not count; one starting later does (it is
 * sold, and onboarding comes before the start). No contract in force is null:
 * not "not sold", because nothing recorded says so.
 */
export function nurtureSoldFrom(contracts: ContractFact[], today: string): boolean | null {
  const inForce = contracts.filter((c) => c.endsOn === null || c.endsOn >= today)
  if (inForce.length === 0) return null
  return inForce.some((c) => (c.automations ?? []).includes('lead_nurture'))
}

function calibrationStep(i: ChecklistInputs): Step {
  const base = { key: 'calibration' as const, title: 'The calibration', kind: 'conversation' as const, href: '/calibrate' }
  if (i.nurtureSold === false) {
    return { ...base, state: 'not_applicable', on: null, href: null,
      line: 'Not part of this client’s contract: the follow-up automation was not sold, so there is nothing to calibrate.' }
  }
  if (i.nurtureSold === undefined) {
    return { ...base, state: 'unknown', on: null, line: 'The contracts could not be read, so whether this step applies is not known.' }
  }
  if (i.nurtureSold === null) {
    return { ...base, state: 'unknown', on: null,
      line: 'No contract is recorded for this client, so whether the follow-up automation was sold is not known. Record the contract on The Month.' }
  }
  return {
    ...base,
    state: i.calibratedOn === undefined ? 'unknown' : i.calibratedOn ? 'done' : 'outstanding',
    on: i.calibratedOn ?? null,
    line: i.calibratedOn === undefined ? 'The calibration could not be read, so this is not known.'
      : i.calibratedOn ? 'The agency set its own matching thresholds, in its own words.'
      : 'An afternoon with the agency, in their words, nothing pre-filled.',
  }
}

export function checklistFor(i: ChecklistInputs): Checklist {
  const recs = Array.isArray(i.records) ? i.records : null
  const recordsState: StepState | null = i.records === null || i.records === 'not_migrated' ? 'unknown' : null
  const rec = (step: 'routing_proved' | 'ai_disclosure_told') => (recs ? one(recs.filter((r) => r.step === step)) : null)

  const routing = rec('routing_proved')
  const disclosure = rec('ai_disclosure_told')
  const notMigrated = i.records === 'not_migrated'
  const cannotRead = notMigrated ? 'Cannot be recorded until migration 0054 is applied.' : 'The records could not be read, so this is not known.'

  const steps: Step[] = [
    {
      key: 'agency', title: 'The agency and its Concierge', kind: 'form', state: 'done', on: i.client.createdOn,
      line: i.client.rehearsal ? 'Created as a rehearsal: kept out of the business’s own figures.' : 'Created as a real agency.',
      href: null,
    },
    {
      key: 'routing', title: 'The routing proof', kind: 'proof',
      state: recordsState ?? (routing ? 'done' : 'outstanding'),
      on: routing?.happenedOn ?? null,
      line: recordsState ? cannotRead
        : routing
          ? `Both halves: this number answered as ${i.client.name}, and ${i.clientNames.get(String(routing.detail.existing_client_id)) ?? 'the other client'} still answered as itself. Recorded by ${routing.recordedBy}.`
          : 'Message this client’s number AND an existing client’s number, and see each answered as itself. Checking only the new one proves nothing.',
      href: null,
    },
    {
      key: 'disclosure', title: 'The AI-disclosure conversation', kind: 'conversation',
      state: recordsState ?? (disclosure ? 'done' : 'outstanding'),
      on: disclosure?.happenedOn ?? null,
      line: recordsState ? cannotRead
        : disclosure
          ? `Told ${String(disclosure.detail.told)}, before they found it in a transcript. Recorded by ${disclosure.recordedBy}.`
          : 'Tell the agency that every first message says it is answered by an AI, and why, before they find it themselves.',
      href: null,
    },
    {
      key: 'declaration', title: 'The contact declaration', kind: 'conversation',
      state: i.declaredOn === undefined ? 'unknown' : i.declaredOn ? 'done' : 'outstanding',
      on: i.declaredOn ?? null,
      line: i.declaredOn === undefined ? 'The declarations could not be read, so this is not known.'
        : i.declaredOn ? 'The agency declared where its contacts came from.'
        : 'The agency declares, in its own name, where its contacts came from. Until it does, the gate refuses every contact, correctly.',
      href: '/segmentation',
    },
    calibrationStep(i),
  ]

  const outstanding = steps.filter((s) => s.state === 'outstanding')
  const unknown = steps.filter((s) => s.state === 'unknown')
  const onboarded = outstanding.length === 0 && unknown.length === 0
  const names = (xs: Step[]) => {
    const t = xs.map((s) => s.title.charAt(0).toLowerCase() + s.title.slice(1))
    return t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`
  }
  const headline = onboarded
    ? `${i.client.name} is onboarded.`
    : outstanding.length
      ? `${outstanding.length} outstanding: ${names(outstanding)}.` + (unknown.length ? ` ${unknown.length} could not be read.` : '')
      : `${unknown.length} step${unknown.length === 1 ? '' : 's'} could not be read, so this client is not shown as onboarded.`
  return { steps, onboarded, outstanding, unknown, headline }
}
