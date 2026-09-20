/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE AUTOMATION STATE MACHINE, ONE VOCABULARY, FIVE WORDS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * docs/cockpit-shared-claims.md S6. The cross-screen sweep found FOUR
 * vocabularies for one state: the client landing said `held` / `off` /
 * `never run` / `enabled, not run`; settings said `held by its gate` / `off`;
 * The Month said `Cannot send`. Five screens, four sets of words, one fact.
 *
 * Decided by the operator, 20 September 2026:
 *
 *   running      it runs, and would send if there were anything to send
 *   never run    it has never run, on this client, ever
 *   held         enabled, but its gate refuses everything today. ALWAYS says
 *                what is holding it, and links there
 *   off          the agency or the operator switched it off. A choice
 *                somebody made
 *   not set up   configured incompletely; something required has not been
 *                supplied
 *
 * 🔒 THE THREE DISTINCTIONS THAT MUST SURVIVE, and each is a pair that looks
 * alike on screen and means opposite things to the person reading:
 *
 *   held vs off          one is a state of the world, the other is a decision
 *                        somebody took. Acting on them differs completely:
 *                        you clear a hold, you reverse a decision.
 *   never run vs running one is an absence of history, the other is a quiet
 *                        Tuesday. "Nothing happened" reads the same and is
 *                        not the same.
 *   not set up vs held   one is OUR omission, the other is a refusal working
 *                        correctly. Calling our own gap a refusal blames the
 *                        gate for something we did not supply.
 *
 * 🔴 `Cannot send` is retired. It describes a consequence rather than a state,
 * and it is what `held` already means. A test asserts it does not come back.
 */

export type AutomationState = 'running' | 'never_run' | 'held' | 'off' | 'not_set_up'

export const AUTOMATION_WORD: Record<AutomationState, string> = {
  running: 'running',
  never_run: 'never run',
  held: 'held',
  off: 'off',
  not_set_up: 'not set up',
}

/**
 * Only two of the five earn a colour, which is §0.5 working rather than a
 * shortage of colours: green is in force, blue is a rule holding something
 * back. `off`, `never run` and `not set up` are absences — of operation, of
 * history, of configuration — and absence is never coloured. They are told
 * apart by their words, which is the point of having exactly five.
 */
export const AUTOMATION_TONE: Record<AutomationState, 'through' | 'held' | 'grey'> = {
  running: 'through',
  held: 'held',
  off: 'grey',
  never_run: 'grey',
  not_set_up: 'grey',
}

export type AutomationFacts = {
  /** The switch, as the configuration holds it. */
  enabled: boolean
  /** Has this automation ever run for THIS client. History, not configuration. */
  everRan: boolean
  /**
   * Required configuration that has not been supplied, named the way the
   * operator would act on it: "a review destination", not "review_destination".
   * Empty means nothing is missing.
   */
  missing: string[]
  /**
   * What its gate would refuse everything for today, if anything — named, with
   * somewhere to go. Null when the gate would let work through.
   */
  heldBy: { what: string; href: string } | null
  /** Who switched it off, and when. §1.10: an act by a person carries both. */
  switchedOffBy?: { who: string; when: string }
}

export type AutomationStatus = {
  state: AutomationState
  word: string
  tone: 'through' | 'held' | 'grey'
  /** What is holding it, when it is held. Never null in the `held` state. */
  heldBy: { what: string; href: string } | null
  /**
   * 🔒 Carried even when it is not the state.
   *
   * An automation that is OFF and whose gate would also refuse everything is
   * both, and the screen may want to say "off — and its gate would refuse
   * anyway". Without this the screen would have to recompute, which is the
   * whole defect this module exists to remove.
   */
  alsoHeldBy: { what: string; href: string } | null
  missing: string[]
}

/**
 * Precedence, and it is a decision rather than an ordering accident.
 *
 * not set up > off > held > never run > running
 *
 *   not set up first, because if something required was never supplied then
 *   "off" hides the reason switching it on would change nothing.
 *   off next, because a decision somebody took outranks a state of the world:
 *   the gate's refusal is moot while nobody has asked it to run.
 *   held next, for the same reason it is not `never run` — a gate refusing
 *   everything is a live fact about today, not an absence of history.
 */
export function automationState(f: AutomationFacts): AutomationStatus {
  const base = { heldBy: null, alsoHeldBy: f.heldBy, missing: f.missing } as const

  if (f.missing.length > 0) {
    return { ...base, state: 'not_set_up', word: AUTOMATION_WORD.not_set_up, tone: AUTOMATION_TONE.not_set_up }
  }
  if (!f.enabled) {
    return { ...base, state: 'off', word: AUTOMATION_WORD.off, tone: AUTOMATION_TONE.off }
  }
  if (f.heldBy) {
    return {
      state: 'held',
      word: AUTOMATION_WORD.held,
      tone: AUTOMATION_TONE.held,
      heldBy: f.heldBy,
      alsoHeldBy: f.heldBy,
      missing: f.missing,
    }
  }
  if (!f.everRan) {
    return { ...base, state: 'never_run', word: AUTOMATION_WORD.never_run, tone: AUTOMATION_TONE.never_run }
  }
  return { ...base, state: 'running', word: AUTOMATION_WORD.running, tone: AUTOMATION_TONE.running }
}
