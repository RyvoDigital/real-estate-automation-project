import { GATES, gatesHoldingAutomation, type Gate } from '@/lib/gates'
import { whyEmpty, type WhyEmpty } from '@/lib/why-empty'
import type { AutomationRead, AutomationsOrUnknown } from '@/lib/landing/automations'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * THREE BANDS, ORDERED BY WHO CAN ACT — and that ordering is the whole screen.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief III §1. The landing answers one question: *is anything here wrong, and
 * is it something I can fix.* Sorting by severity would answer a different one,
 * because a critical anomaly I can fix in four minutes and a critical anomaly
 * held behind a lawyer since August are not the same call on an operator's
 * morning, however alike they look.
 *
 *   ours      an automation erroring, an invariant firing, a config gap
 *   theirs    something THIS agency could answer this week
 *   nobody's  Meta, a lawyer, ADENE. Shown so it is not re-diagnosed weekly
 *
 * 🔴 NO SCORE, NO GRADE, NO COLOUR FOR THE CLIENT AS A WHOLE. The bands exist
 * precisely so that a ninety-minute wait and an unanswered lawyer question do
 * not collapse into one dot. A dot would be computed as though it were a fact
 * about the world (§5j), and it would be the single most-read thing on the
 * page.
 *
 * 🔒 PURE. Every input is passed in. The screen does the reading, this does the
 * deciding, and a test can drive every state without a database — which is the
 * only reason the states that cannot happen today are testable at all.
 */

export type BandKey = 'ours' | 'theirs' | 'nobodys'

export type BandItem = {
  id: string
  /** What is wrong or waiting, in the operator's words. */
  what: string
  /**
   * 🔒 The screen this opens, NAMED. Brief III: every number is a door, and a
   * door says where it goes before it is opened. Null only where the thing to
   * open does not exist — and then the item says so in `what` rather than
   * rendering a link to nowhere.
   */
  opens: { label: string; href: string } | null
  /**
   * §0.5, and only these four reach a band item.
   *   red    an erroring run, or a critical invariant
   *   held   a rule holding something back until somebody answers
   *   clock  a clock is the reason — an outside wait, with its own track
   *   grey   present, but neither in force nor held. Absence is never coloured
   */
  tone: 'red' | 'held' | 'clock' | 'grey'
  /** A stored code, rendered in mono beneath. Never prose. */
  code?: string
  /** ISO date the wait began, for the 7- and 21-day track. */
  since?: string
}

export type Band = {
  key: BandKey
  title: string
  /** What the band covers, for the ⓘ rather than the page body. */
  scope: string
  items: BandItem[]
  /** Null when the band has items. Otherwise why it is empty, in its own words. */
  empty: WhyEmpty | null
}

/** What the anomalies screen found for this client, or null if it could not be asked. */
export type AnomalyTally = {
  critical: number
  warning: number
  /**
   * 🔴 Anomalies in the window whose event names no client.
   *
   * `events.client_id` is nullable, so scoping by client silently drops them.
   * On the operator's anomalies screen they appear; here they would not, and
   * the difference would look like the landing disagreeing with the screen it
   * links to — which is the whole family of defect the shared-claims register
   * was written after. So it is counted and said out loud.
   */
  unattributed: number
}

export type BandInput = {
  clientId: string
  automations: AutomationsOrUnknown
  anomalies: AnomalyTally | null
  /** The thrown sentence, when the anomaly read failed rather than returned nothing. */
  anomaliesThrew?: string
}

const href = (clientId: string, screen: string) => `/c/${clientId}/${screen}`

/* ── band 1: ours to fix ──────────────────────────────────────────────────── */

function ours(input: BandInput): Band {
  const items: BandItem[] = []
  const { clientId, automations, anomalies } = input

  if (automations) {
    for (const a of automations) {
      if (a.erroredRecently > 0) {
        items.push({
          id: `errored:${a.key}`,
          what: `${a.name} has ${a.erroredRecently} errored run${a.erroredRecently === 1 ? '' : 's'}${
            a.lastRun?.errorType ? `, the last one ${a.lastRun.errorType}` : ''
          }`,
          opens: { label: 'opens Health', href: '/health' },
          tone: 'red',
          code: a.lastRun?.errorType ?? undefined,
        })
      }
      if (a.status.state === 'not_set_up') {
        // 🔒 Ours, not theirs. A configuration nobody supplied is our omission
        // until we have asked for it; calling it a refusal would blame the
        // gate for something we never requested.
        items.push({
          id: `notsetup:${a.key}`,
          what: `${a.name} is not set up — ${a.status.missing.join('; ')}`,
          opens: { label: 'opens Settings', href: href(clientId, 'settings') },
          tone: 'grey',
        })
      }
    }
  }

  if (anomalies && anomalies.critical > 0) {
    items.push({
      id: 'anomalies:critical',
      what: `${anomalies.critical} critical anomal${anomalies.critical === 1 ? 'y' : 'ies'} for this client`,
      opens: { label: 'opens Anomalies', href: href(clientId, 'anomalies') },
      tone: 'red',
    })
  }

  return {
    key: 'ours',
    title: 'Ours to fix',
    scope: 'an automation erroring, an invariant firing, or configuration we never supplied',
    items,
    empty: items.length > 0 ? null : emptyOurs(input),
  }
}

function emptyOurs(input: BandInput): WhyEmpty {
  // 🔴 A failed read outranks an empty one. Saying "nothing is wrong" on the
  // strength of a query that threw is the screen inventing the good news.
  if (input.automations === null) {
    return whyEmpty({
      state: 'readFailed',
      thing: "this client's automations",
      threw: 'the automations could not be read',
    })
  }
  if (input.anomalies === null) {
    return whyEmpty({
      state: 'notChecked',
      thing: 'anomalies for this client',
      why: input.anomaliesThrew ?? 'the read did not land',
      notTheSameAs: 'a client with no anomalies',
    })
  }
  return whyEmpty({
    state: 'resting',
    thing: 'errors, firing invariants or configuration gaps',
    scope: 'for this client',
    welcome: true,
  })
}

/* ── bands 2 and 3: both read the ledger, and differ only in who can end it ── */

function gateItems(input: BandInput, side: Gate['answerable']): BandItem[] {
  if (!input.automations) return []

  // One entry per gate, naming every automation it holds — not one per
  // automation, which would print Meta three times and make one wait look
  // like three.
  const byGate = new Map<string, { gate: Gate; automations: AutomationRead[] }>()
  for (const a of input.automations) {
    for (const { gate } of gatesHoldingAutomation(a.key)) {
      if (gate.answerable !== side) continue
      const seen = byGate.get(gate.id)
      if (seen) seen.automations.push(a)
      else byGate.set(gate.id, { gate, automations: [a] })
    }
  }

  return [...byGate.values()]
    .sort((x, y) => GATES.indexOf(x.gate) - GATES.indexOf(y.gate))
    .map(({ gate, automations }) => ({
      id: `gate:${gate.id}`,
      what: `${gate.what} — holding ${automations.map((a) => a.name).join(' and ')}`,
      // 🔒 There is no waiting room yet, so this points at the ledger's own
      // band on this page rather than at a screen that does not exist.
      opens: null,
      tone: side === 'the agency' ? ('held' as const) : ('clock' as const),
      code: gate.id,
      since: gate.since,
    }))
}

function theirs(input: BandInput): Band {
  const items = gateItems(input, 'the agency')
  return {
    key: 'theirs',
    title: 'Theirs to answer',
    scope: 'things this agency could settle this week — an afternoon of calibration, a close reported',
    items,
    empty: items.length > 0 ? null : emptyGateBand(input, 'this agency'),
  }
}

function nobodys(input: BandInput): Band {
  const items = gateItems(input, 'outside')
  return {
    key: 'nobodys',
    title: "Nobody's yet",
    scope: 'waits nobody in this building can move — shown so they are not re-diagnosed every week',
    items,
    empty: items.length > 0 ? null : emptyGateBand(input, 'anybody outside'),
  }
}

function emptyGateBand(input: BandInput, who: string): WhyEmpty {
  if (input.automations === null) {
    return whyEmpty({
      state: 'readFailed',
      thing: "this client's automations",
      threw: 'the automations could not be read, so what is holding them is not known',
    })
  }
  return whyEmpty({
    state: 'resting',
    thing: `anything waiting on ${who}`,
    scope: "for this client's automations",
  })
}

/**
 * 🔒 The order is the design. `ours` first, always, even when it is the empty
 * one — a band that moved when it filled would make the page a different shape
 * every morning, and the one thing an operator should be able to do without
 * reading is know where to look first.
 */
export function bands(input: BandInput): Band[] {
  return [ours(input), theirs(input), nobodys(input)]
}
