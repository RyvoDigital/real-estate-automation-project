import type { Checklist } from '@/lib/onboarding-checklist'

/**
 * /CLIENTS — Q: who are all my agencies, and how is each one doing?
 * (brief §1.2 and §2.2; checkpoint 1, 23 Sep 2026. Pure: every input passed in.)
 *
 * The screen the switcher's menu could not be. The switcher answers "which
 * client?" in one click and hands off; this answers "how is everyone?", which
 * needs a row per agency and cannot be a menu.
 *
 *   🔒 IT LISTS, IT DOES NOT ACT. No control that sends, enables, disables or
 *      contacts. Every row opens that client's landing, where the doing is.
 *   🔒 REHEARSALS APPEAR, MARKED (operator's decision, 22 Sep 2026). This is
 *      the list of WHO EXISTS, not a count of the business's work — the
 *      opposite rule from Today and /ops/expiries, and it is deliberate.
 *   🔴 A FAILED READ IS A FAILURE PER FIELD, NEVER A ZERO (§0.4-5). "0 waiting"
 *      and "we could not read who is waiting" are different sentences, and only
 *      one of them is a reason to go home.
 *   🔴 NO MONEY HERE. The Month owns every figure about what anyone pays; a
 *      revenue column on this screen would be a second place those figures
 *      live, and they would disagree on the day that matters.
 *   🔒 NO SAMPLE DATA, EVER. An empty cockpit shown to an agency says "you
 *      would be the first on it"; a cockpit with invented agencies in it says
 *      something false about the business.
 */

/** A number we could not read. Never rendered as 0. */
export type Unknown = 'unknown'
export type Count = number | Unknown

export type ClientAutomation = { key: string; name: string; enabled: boolean }

export type ClientRowInputs = {
  id: string
  name: string
  /** 🔴 null when nobody answered the question (0038 is still blocked) */
  rehearsal: boolean | null
  checklist: Checklist | null
}

export type ClientListInputs = {
  /** null = the clients themselves could not be read: the screen has nothing to say */
  clients: ClientRowInputs[] | null
  /** per client; null = the read failed for ALL of them */
  automations: Map<string, ClientAutomation[]> | null
  /** leads waiting on a human, per client */
  waiting: Map<string, number> | null
  /** faults in the anomaly window, per client */
  faults: Map<string, number> | null
  /** the last time anything happened for this client, per client */
  lastActivity: Map<string, string> | null
  /** expiries already grouped by client: what has run out, and what is about to */
  expiries: Map<string, { runOut: number; aboutTo: number; toConfirm: number }> | null
  /** the window the faults count covers, so the screen never re-types it */
  faultWindowDays: number
  now: Date
}

export type ClientRow = {
  id: string
  name: string
  href: string
  /** 'rehearsal' · 'real' · 'not_answered' — three states, never two */
  standing: 'rehearsal' | 'real' | 'not_answered'
  automationsOn: Count
  /** the names of what is on, for the one line under the name */
  automationNames: string[]
  waiting: Count
  faults: Count
  runOut: Count
  aboutTo: Count
  toConfirm: Count
  /** 🔴 the gate refuses EVERY contact until the agency declares where they came from */
  gateRefusingEverything: boolean | Unknown
  onboarded: boolean | Unknown
  /** what onboarding still waits on, in the checklist's own words */
  outstanding: string[]
  lastActivity: string | null | Unknown
  /** why this row is where it is, in one word, for the test and the screen */
  attention: Attention
}

/**
 * 🔒 THE ORDER, DECIDED 23 SEP 2026 (operator: "most needing attention first").
 *
 * Ranked by what the operator would act on soonest, and the order of the first
 * two is the argument:
 *   1. `waiting` — a person is waiting for a human. Concrete, and the clock is
 *      running on somebody's patience.
 *   2. `refused` — the gate refuses every contact, because no declaration was
 *      recorded. Nothing is reaching anybody and nothing will say so on its
 *      own: it is silent, which is why it outranks everything below it.
 *   3. `runOut` — something we hold has expired.
 *   4. `faults` — something broke in the window.
 *   5. `soon` — an expiry or a registration to confirm.
 *   6. `onboarding` — still being taken on.
 *   7. `quiet` — nothing outstanding.
 *
 * 🔒 UNKNOWN RANKS AS ATTENTION, not as calm: a client whose queue could not be
 * read may have somebody waiting, and sorting it to the bottom would hide
 * exactly the case the read failed on.
 */
export type Attention = 'waiting' | 'refused' | 'runOut' | 'faults' | 'soon' | 'onboarding' | 'unknown' | 'quiet'

const RANK: Record<Attention, number> = {
  waiting: 0, refused: 1, runOut: 2, faults: 3, soon: 4, onboarding: 5, unknown: 6, quiet: 7,
}

export type ClientList = {
  rows: ClientRow[]
  /** 🔴 what could not be read, named, so no figure below is read as complete */
  failures: string[]
  /** the counts the screen prints with its lists, computed once */
  totals: { clients: number; rehearsals: number; notAnswered: number }
  /** null when there are clients; the sentence when there are none */
  empty: string | null
  faultWindowDays: number
  at: string
}

const num = (m: Map<string, number> | null, id: string): Count => (m === null ? 'unknown' : (m.get(id) ?? 0))

/** The one thing a row is about, by the ranking above. */
export function attentionFor(r: Omit<ClientRow, 'attention' | 'href'>): Attention {
  if (r.waiting === 'unknown' || r.runOut === 'unknown' || r.gateRefusingEverything === 'unknown') {
    // Unknown only wins when nothing certain is already demanding attention.
    if (r.waiting === 'unknown' && r.runOut === 'unknown' && r.gateRefusingEverything === 'unknown') return 'unknown'
  }
  if (typeof r.waiting === 'number' && r.waiting > 0) return 'waiting'
  if (r.gateRefusingEverything === true) return 'refused'
  if (typeof r.runOut === 'number' && r.runOut > 0) return 'runOut'
  if (typeof r.faults === 'number' && r.faults > 0) return 'faults'
  if ((typeof r.aboutTo === 'number' && r.aboutTo > 0) || (typeof r.toConfirm === 'number' && r.toConfirm > 0)) return 'soon'
  if (r.onboarded === false) return 'onboarding'
  if (r.waiting === 'unknown' || r.faults === 'unknown' || r.onboarded === 'unknown') return 'unknown'
  return 'quiet'
}

export function buildClientList(i: ClientListInputs): ClientList {
  const at = i.now.toISOString()
  const failures: string[] = []
  if (i.clients === null) {
    return {
      rows: [], failures: ['The agencies could not be read, so this screen is empty for a reason that is not "there are none".'],
      totals: { clients: 0, rehearsals: 0, notAnswered: 0 }, empty: null, faultWindowDays: i.faultWindowDays, at,
    }
  }
  if (i.automations === null) failures.push('Which automations are on could not be read.')
  if (i.waiting === null) failures.push('Who is waiting on a human could not be read.')
  if (i.faults === null) failures.push('What went wrong recently could not be read.')
  if (i.lastActivity === null) failures.push('When anything last happened could not be read.')
  if (i.expiries === null) failures.push('What has run out could not be read.')

  const rows: ClientRow[] = i.clients.map((c) => {
    const mine = i.automations?.get(c.id) ?? []
    const on = mine.filter((a) => a.enabled)
    const exp = i.expiries?.get(c.id)
    const declaration = c.checklist?.steps.find((s) => s.key === 'declaration')

    const base = {
      id: c.id,
      name: c.name,
      standing: (c.rehearsal === true ? 'rehearsal' : c.rehearsal === false ? 'real' : 'not_answered') as ClientRow['standing'],
      automationsOn: (i.automations === null ? 'unknown' : on.length) as Count,
      automationNames: on.map((a) => a.name),
      waiting: num(i.waiting, c.id),
      faults: num(i.faults, c.id),
      runOut: (i.expiries === null ? 'unknown' : (exp?.runOut ?? 0)) as Count,
      aboutTo: (i.expiries === null ? 'unknown' : (exp?.aboutTo ?? 0)) as Count,
      toConfirm: (i.expiries === null ? 'unknown' : (exp?.toConfirm ?? 0)) as Count,
      /*
       * 🔴 THE GATE REFUSES EVERY CONTACT until the agency declares, in its own
       * name, where they came from. `unknown` when the checklist could not be
       * read: we do not get to say the gate is fine because we could not look.
       */
      gateRefusingEverything: (c.checklist === null || !declaration || declaration.state === 'unknown'
        ? 'unknown'
        : declaration.state !== 'done') as boolean | Unknown,
      onboarded: (c.checklist === null ? 'unknown' : c.checklist.onboarded) as boolean | Unknown,
      outstanding: c.checklist?.outstanding.map((s) => s.title) ?? [],
      lastActivity: (i.lastActivity === null ? 'unknown' : (i.lastActivity.get(c.id) ?? null)) as string | null | Unknown,
    }
    return { ...base, href: `/c/${c.id}`, attention: attentionFor(base) }
  })

  /*
   * 🔒 THE ORDER, SETTLED 23 SEP 2026: rehearsals ALWAYS last, whatever state
   * they are in; then attention; then alphabetical.
   *
   * Checkpoint 1 ranked attention first and used real-before-rehearsal only as
   * a tie-break, which put a rehearsal's waiting lead above a real agency with
   * nothing wrong. The operator's rule is the right one: a rehearsal is not the
   * business's work, so it never competes for the top of the list — it is on
   * the screen because this is who exists, and that is all.
   *
   * 🔒 The rule is printed ON the screen (ClientsView), so the order is never a
   * mystery to somebody reading it cold.
   */
  rows.sort((a, b) =>
    (a.standing === 'rehearsal' ? 1 : 0) - (b.standing === 'rehearsal' ? 1 : 0) ||
    RANK[a.attention] - RANK[b.attention] ||
    a.name.localeCompare(b.name))

  return {
    rows,
    failures,
    totals: {
      clients: rows.length,
      rehearsals: rows.filter((r) => r.standing === 'rehearsal').length,
      notAnswered: rows.filter((r) => r.standing === 'not_answered').length,
    },
    // 🔒 The empty state is the real one, and it stays: no agency has been taken on yet.
    empty: rows.length === 0 ? 'No agency has been taken on yet. The first one is taken on through Onboarding, and it appears here the moment it exists.' : null,
    faultWindowDays: i.faultWindowDays,
    at,
  }
}
