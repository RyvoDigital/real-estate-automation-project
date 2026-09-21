/*
 * The Month — brief I §2.10–2.11, design v3 (claude.ai/artifact/LAxEUFaC95X1pe3H77sYeD).
 *
 * PURE. Rows in, a model out; nothing here reads a database or a clock. The page
 * reads (./read.ts), passes today's Lisbon date, and renders what this returns,
 * so every rule below is a unit test rather than a screenshot.
 *
 * The rules this file exists to hold, each a line of the brief:
 *   🔒 recurring and one-off revenue are never summed into one figure;
 *   🔒 recurring for a month is the contracts COVERING that month, never a
 *      client's status (which would rewrite past months when a client leaves);
 *   🔒 a net is never computed for a month in progress — it is withheld, and the
 *      last CLOSED month's net stands beneath it, dated;
 *   🔒 last month's costs never stand in for this month's;
 *   🔒 rehearsal clients are not the business: never counted, only counted apart;
 *   🔒 nothing is apportioned: a cost sits at its own level (a business, or the
 *      company) and nowhere else;
 *   🔒 a line is never drawn for a series that has never existed — the year has
 *      no value before the first contract, not a zero;
 *   🔒 a client under contract with a status that says it left is a CONFLICT,
 *      shown and never counted; a real client with no terms is UNKNOWN, not €0.
 *
 * Amounts are integer cents throughout: numeric(10,2) arrives from PostgREST as
 * a JSON number, and float sums of euros drift by a cent often enough to be seen.
 */

export type Business = 'automation' | 'web'
export type Month = { y: number; m: number } // m is 1–12

// ---------------------------------------------------------------- the rows

/** client_contracts_uncorrected, by the named columns brief §2.11 lists — no others. */
export type ContractRow = {
  id: string
  automation_client_id: string | null
  web_client_id: string | null
  monthly_eur: number | string
  setup_eur: number | string | null
  setup_terms: string | null
  starts_on: string
  ends_on: string | null
  automations: string[] | null
  signed_by: string
  recorded_by: string
  recorded_at: string
  created_at: string
  supersedes_id: string | null
}
export type AutomationClientRow = { id: string; name: string; status: string; rehearsal: boolean }
export type WebClientRow = { id: string; name: string; status: string; rehearsal: boolean; started_on: string; ended_on: string | null }
export type PaymentRow = {
  id: string
  automation_client_id: string | null
  web_client_id: string | null
  kind: 'setup' | 'project' | 'monthly' | 'other' | string
  amount_eur: number | string
  settled_on: string | null
  settled_amount_eur: number | string | null
  written_off_on: string | null
}
export type CostRow = {
  id: string
  label: string
  category: string
  side: 'automation' | 'web' | 'shared' | string
  amount_eur: number | string
  cadence: 'monthly' | 'annual' | 'one_off' | string
  started_on: string
  ended_on: string | null
}

/** Each source is read on its own; null means THAT read failed (S4), and only its panels say so. */
export type MonthInputs = {
  contracts: ContractRow[] | null
  automationClients: AutomationClientRow[] | null
  webClients: WebClientRow[] | null
  payments: PaymentRow[] | null
  costs: CostRow[] | null
}

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0')
export const monthKey = (M: Month) => `${M.y}-${pad(M.m)}`
export const firstDay = (M: Month) => `${monthKey(M)}-01`
export const daysIn = (M: Month) => new Date(Date.UTC(M.y, M.m, 0)).getUTCDate()
export const lastDay = (M: Month) => `${monthKey(M)}-${pad(daysIn(M))}`
export function addMonths(M: Month, n: number): Month {
  const i = M.y * 12 + (M.m - 1) + n
  return { y: Math.floor(i / 12), m: (i % 12) + 1 }
}
export function monthOf(date: string): Month {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) }
}
export const sameMonth = (a: Month, b: Month) => a.y === b.y && a.m === b.m
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (M: Month) => MONTHS[M.m - 1]
export const monthLabel = (M: Month) => `${monthName(M)} ${M.y}`

/** Today as a calendar date in Lisbon — the business's day, not the server's (UTC). */
export function lisbonToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export type Phase =
  | { kind: 'in_progress'; day: number; days: number }
  | { kind: 'closed'; days: number }
  | { kind: 'future' }

export function phaseOf(M: Month, today: string): Phase {
  if (today < firstDay(M)) return { kind: 'future' }
  if (today > lastDay(M)) return { kind: 'closed', days: daysIn(M) }
  return { kind: 'in_progress', day: Number(today.slice(8, 10)), days: daysIn(M) }
}

// ---------------------------------------------------------------- money

/** numeric(10,2) → integer cents. A value that is not a number is a defect in the row, not a zero. */
export function cents(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error(`not an amount: ${JSON.stringify(v)}`)
  return Math.round(n * 100)
}

/** "€1 234,50" — Portuguese grouping, as the design writes it; a minus is a real minus sign. */
export function eur(c: number): string {
  const neg = c < 0
  const a = Math.abs(c)
  const whole = Math.floor(a / 100)
  const rest = a % 100
  return `${neg ? '−' : ''}€${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${pad(rest)}`
}

// ---------------------------------------------------------------- contracts

export const contractBusiness = (c: ContractRow): Business => (c.automation_client_id ? 'automation' : 'web')
const partyOf = (c: { automation_client_id: string | null; web_client_id: string | null }) =>
  (c.automation_client_id ?? c.web_client_id) as string

export function coversMonth(c: { starts_on: string; ends_on: string | null }, M: Month): boolean {
  return c.starts_on <= lastDay(M) && (c.ends_on === null || c.ends_on >= firstDay(M))
}

const SHORT_DAY = (d: string) => `${Number(d.slice(8, 10))} ${monthName(monthOf(d)).slice(0, 3)}`

/**
 * A contract that covers only part of the month is COUNTED WHOLE for it, and
 * says so on its row. 🔴 An open decision (checkpoint 1): the brief sums "the
 * periods covering that month" and does not say how a period that starts on the
 * 15th counts. Counting it whole and saying so is visible; prorating silently
 * would be a number resting on a rule nobody chose.
 */
function partialNote(c: ContractRow, M: Month): string | null {
  const starts = c.starts_on > firstDay(M)
  const ends = c.ends_on !== null && c.ends_on < lastDay(M)
  if (starts && ends) return `runs ${SHORT_DAY(c.starts_on)}–${SHORT_DAY(c.ends_on as string)} — counted whole`
  if (starts) return `starts ${SHORT_DAY(c.starts_on)} — counted whole`
  if (ends) return `ends ${SHORT_DAY(c.ends_on as string)} — counted whole`
  return null
}

// ---------------------------------------------------------------- costs

export type CostLine = {
  id: string
  label: string
  cents: number
  kind: 'fixed' | 'one_off'
  note: string | null
  renewsWithin30: boolean
}

export function costLineFor(c: CostRow, M: Month, today: string): CostLine | null {
  const full = cents(c.amount_eur) ?? 0
  if (c.cadence === 'one_off') {
    return sameMonth(monthOf(c.started_on), M)
      ? { id: c.id, label: c.label, cents: full, kind: 'one_off', note: `one-off, ${SHORT_DAY(c.started_on)}`, renewsWithin30: false }
      : null
  }
  if (!coversMonth({ starts_on: c.started_on, ends_on: c.ended_on }, M)) return null
  if (c.cadence === 'annual') {
    const renews = nextAnniversary(c.started_on, today)
    return {
      id: c.id,
      label: c.label,
      cents: Math.round(full / 12),
      kind: 'fixed',
      note: `annual ${eur(full)} · one twelfth a month · renews ${SHORT_DAY(renews)}`,
      renewsWithin30: c.ended_on === null && daysBetween(today, renews) <= 30,
    }
  }
  return { id: c.id, label: c.label, cents: full, kind: 'fixed', note: null, renewsWithin30: false }
}

function nextAnniversary(start: string, today: string): string {
  let y = Number(today.slice(0, 4))
  let d = `${y}${start.slice(4)}`
  if (d < today) d = `${++y}${start.slice(4)}`
  return d
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * 🔴 USAGE IS NOT MEASURED YET, and the page says so rather than showing costs
 * that look complete. The brief's "computed" costs — WhatsApp from Twilio's
 * read-back price, the model from stored tokens × a recorded per-model price —
 * have no source today: no price is stored per message and no per-model price
 * is recorded. So every month's costs EXCLUDE usage, and every net says it.
 */
export const USAGE = {
  measured: false as const,
  why: 'WhatsApp and model usage are not measured yet: no price is stored per message, and no per-model price is recorded',
}

// ---------------------------------------------------------------- the model

export type ClientLine = { key: string; name: string; since: string; monthlyCents: number; note: string | null }
export type OneOffLine = { key: string; label: string; cents: number; on: string }
export type Leaves =
  /** nothing was recorded for this month at this level: no false zero, a sentence */
  | { kind: 'nothing' }
  /** in progress; lastClosed is null when nothing was recorded in that month either */
  | { kind: 'withheld'; lastClosed: { month: Month; cents: number } | null }
  | { kind: 'value'; cents: number; completeFromDayOne: boolean }
  | { kind: 'unreadable' }

export type Half = {
  business: Business
  /** null: a read this half depends on failed (S4). */
  recurringCents: number | null
  everContracted: boolean
  firstContractMonth: Month | null
  /** twelve months ending with M; null before the first contract ever (no line), cents after */
  year: { month: Month; cents: number | null }[] | null
  clients: ClientLine[] | null
  unknown: string[]
  conflicts: { name: string; why: string }[]
  costs: CostLine[] | null
  costCents: number | null
  leaves: Leaves
  oneOff: OneOffLine[] | null
  oneOffCents: number | null
  setupOutstanding: { name: string; cents: number }[]
  rehearsals: number | null
  failed: string[]
}

export type MonthModel = {
  month: Month
  phase: Phase
  today: string
  halves: { web: Half; automation: Half }
  company: { costs: CostLine[] | null; costCents: number | null }
  sums: {
    recurringCents: number | null
    composition: { web: number; automation: number } | null
    oneOffCents: number | null
    costCents: number | null
    fixedCents: number | null
    net: Leaves
    /** anything at all (a contract or a cost) counts in this month */
    anythingRecorded: boolean
  }
  /** nothing at all has ever been recorded: S2, the page's primary state */
  neverAnything: boolean
  failed: string[]
}

const isReal = (x: { rehearsal: boolean }) => x.rehearsal === false

type Ctx = {
  names: Map<string, string>
  realParties: Set<string>
  rehearsalParties: Set<string>
}

function ctxOf(inp: MonthInputs): Ctx {
  const names = new Map<string, string>()
  const realParties = new Set<string>()
  const rehearsalParties = new Set<string>()
  for (const c of inp.automationClients ?? []) {
    names.set(c.id, c.name)
    ;(isReal(c) ? realParties : rehearsalParties).add(c.id)
  }
  for (const c of inp.webClients ?? []) {
    names.set(c.id, c.name)
    ;(isReal(c) ? realParties : rehearsalParties).add(c.id)
  }
  return { names, realParties, rehearsalParties }
}

/** A contract is the business's only when its party is a declared, real client we could read. */
function realContracts(inp: MonthInputs, ctx: Ctx, b: Business): ContractRow[] {
  return (inp.contracts ?? []).filter((c) => contractBusiness(c) === b && ctx.realParties.has(partyOf(c)))
}

const LEFT: Record<Business, string[]> = { automation: ['churned', 'paused'], web: ['ended', 'paused'] }

function statusOf(inp: MonthInputs, b: Business, id: string): string | null {
  const rows = b === 'automation' ? inp.automationClients : inp.webClients
  return rows?.find((r) => r.id === id)?.status ?? null
}

function recurringFor(inp: MonthInputs, ctx: Ctx, b: Business, M: Month) {
  const lines: ClientLine[] = []
  const conflicts: { name: string; why: string }[] = []
  let total = 0
  const covering = realContracts(inp, ctx, b)
    .filter((c) => coversMonth(c, M))
    .sort((x, y) => (x.starts_on === y.starts_on ? x.recorded_at.localeCompare(y.recorded_at) : x.starts_on.localeCompare(y.starts_on)))
  for (const c of covering) {
    const party = partyOf(c)
    const name = ctx.names.get(party) ?? 'a client that could not be named'
    const status = statusOf(inp, b, party)
    if (c.ends_on === null && status !== null && LEFT[b].includes(status)) {
      conflicts.push({ name, why: `its status is ${status}, but its contract has no end date — not counted until one of the two is corrected` })
      continue
    }
    const m = cents(c.monthly_eur) ?? 0
    total += m
    lines.push({ key: c.id, name, since: `from ${SHORT_DAY(c.starts_on)} ${c.starts_on.slice(0, 4)}`, monthlyCents: m, note: partialNote(c, M) })
  }
  return { total, lines, conflicts }
}

function oneOffFor(inp: MonthInputs, ctx: Ctx, b: Business, M: Month): OneOffLine[] {
  return (inp.payments ?? [])
    .filter((p) => (b === 'automation' ? p.automation_client_id : p.web_client_id) !== null)
    .filter((p) => ctx.realParties.has(partyOf(p)))
    .filter((p) => p.kind !== 'monthly') // recurring comes from contracts; a monthly receipt is not a second revenue
    .filter((p) => p.settled_on !== null && sameMonth(monthOf(p.settled_on), M))
    .map((p) => ({
      key: p.id,
      label: `${ctx.names.get(partyOf(p)) ?? 'a client'} — ${p.kind === 'setup' ? 'setup' : p.kind === 'project' ? 'project' : 'other'}`,
      cents: cents(p.settled_amount_eur) ?? 0,
      on: p.settled_on as string,
    }))
}

function setupOutstandingFor(inp: MonthInputs, ctx: Ctx, b: Business, today: string) {
  const out: { name: string; cents: number }[] = []
  const byParty = new Map<string, ContractRow>()
  for (const c of realContracts(inp, ctx, b)) {
    if (c.starts_on > today) continue
    const prev = byParty.get(partyOf(c))
    if (!prev || prev.starts_on < c.starts_on) byParty.set(partyOf(c), c)
  }
  for (const [party, c] of byParty) {
    const setup = cents(c.setup_eur)
    if (!setup) continue
    const paid = (inp.payments ?? [])
      .filter((p) => partyOf(p) === party && p.kind === 'setup' && p.settled_on !== null)
      .reduce((s, p) => s + (cents(p.settled_amount_eur) ?? 0), 0)
    if (setup - paid > 0) out.push({ name: ctx.names.get(party) ?? 'a client', cents: setup - paid })
  }
  return out
}

function costsFor(inp: MonthInputs, side: string, M: Month, today: string): CostLine[] | null {
  if (inp.costs === null) return null
  return inp.costs
    .filter((c) => c.side === side)
    .map((c) => costLineFor(c, M, today))
    .filter((x): x is CostLine => x !== null)
}

const sumC = (xs: { cents: number }[]) => xs.reduce((s, x) => s + x.cents, 0)

/**
 * Whether anything was recorded that counts in month M at this level: a real
 * contract covering it, or a cost line for it. 🔒 Without either, a figure for
 * M would be a zero drawn over nothing — "August left €0,00" about a month in
 * which nothing existed (the first real render, 21 Sep 2026).
 */
function anythingIn(inp: MonthInputs, ctx: Ctx, sides: ('automation' | 'web' | 'shared')[], M: Month, today: string): boolean {
  const contract = (inp.contracts ?? []).some(
    (c) => sides.includes(contractBusiness(c)) && ctx.realParties.has(partyOf(c)) && coversMonth(c, M),
  )
  const cost = sides.some((side) => (costsFor(inp, side, M, today) ?? []).length > 0)
  return contract || cost
}

function half(inp: MonthInputs, ctx: Ctx, b: Business, M: Month, today: string, phase: Phase): Half {
  const failed: string[] = []
  const contractsOk = inp.contracts !== null && (b === 'automation' ? inp.automationClients : inp.webClients) !== null
  if (inp.contracts === null) failed.push('contracts')
  if ((b === 'automation' ? inp.automationClients : inp.webClients) === null) failed.push(b === 'automation' ? 'automation clients' : 'web clients')
  if (inp.costs === null) failed.push('costs')
  if (inp.payments === null) failed.push('payments')

  const all = contractsOk ? realContracts(inp, ctx, b) : []
  const firstStart = all.map((c) => c.starts_on).sort()[0] ?? null
  const firstContractMonth = firstStart ? monthOf(firstStart) : null
  const rec = contractsOk ? recurringFor(inp, ctx, b, M) : null

  const year = contractsOk
    ? Array.from({ length: 12 }, (_, i) => {
        const mm = addMonths(M, i - 11)
        const before = firstContractMonth === null || monthKey(mm) < monthKey(firstContractMonth)
        return { month: mm, cents: before ? null : recurringFor(inp, ctx, b, mm).total }
      })
    : null

  // a real client that is active and has no contract covering this month: unknown, not €0
  const unknown: string[] = []
  if (contractsOk) {
    const rows = (b === 'automation' ? inp.automationClients : inp.webClients) ?? []
    for (const r of rows) {
      if (!isReal(r) || LEFT[b].includes(r.status)) continue
      if (!all.some((c) => partyOf(c) === r.id && coversMonth(c, M))) unknown.push(r.name)
    }
  }

  const costs = costsFor(inp, b, M, today)
  const costCents = costs ? sumC(costs) : null
  const oneOff = inp.payments !== null && contractsOk ? oneOffFor(inp, ctx, b, M) : null

  let leaves: Leaves
  if (rec === null || costCents === null) leaves = { kind: 'unreadable' }
  else if (!anythingIn(inp, ctx, [b], M, today)) leaves = { kind: 'nothing' }
  else if (b === 'web') leaves = { kind: 'value', cents: rec.total - costCents, completeFromDayOne: phase.kind === 'in_progress' }
  else if (phase.kind === 'in_progress') {
    const prev = addMonths(M, -1)
    const pr = recurringFor(inp, ctx, b, prev).total
    const pc = sumC(costsFor(inp, b, prev, today) ?? [])
    leaves = { kind: 'withheld', lastClosed: anythingIn(inp, ctx, [b], prev, today) ? { month: prev, cents: pr - pc } : null }
  } else leaves = { kind: 'value', cents: rec.total - costCents, completeFromDayOne: false }

  const rows = b === 'automation' ? inp.automationClients : inp.webClients
  return {
    business: b,
    recurringCents: rec ? rec.total : null,
    everContracted: all.length > 0,
    firstContractMonth,
    year,
    clients: rec ? rec.lines : null,
    unknown,
    conflicts: rec ? rec.conflicts : [],
    costs,
    costCents,
    leaves,
    oneOff,
    oneOffCents: oneOff ? sumC(oneOff) : null,
    setupOutstanding: contractsOk && inp.payments !== null ? setupOutstandingFor(inp, ctx, b, today) : [],
    rehearsals: rows ? rows.filter((r) => r.rehearsal).length : null,
    failed,
  }
}

export function buildMonth(inp: MonthInputs, M: Month, today: string): MonthModel {
  const ctx = ctxOf(inp)
  const phase = phaseOf(M, today)
  const web = half(inp, ctx, 'web', M, today, phase)
  const automation = half(inp, ctx, 'automation', M, today, phase)
  const companyCosts = costsFor(inp, 'shared', M, today)
  const companyCents = companyCosts ? sumC(companyCosts) : null

  const recurring = web.recurringCents !== null && automation.recurringCents !== null ? web.recurringCents + automation.recurringCents : null
  const costCents =
    web.costCents !== null && automation.costCents !== null && companyCents !== null ? web.costCents + automation.costCents + companyCents : null
  const fixedCents =
    web.costs && automation.costs && companyCosts
      ? sumC([...web.costs, ...automation.costs, ...companyCosts].filter((c) => c.kind === 'fixed'))
      : null
  const oneOff = web.oneOffCents !== null && automation.oneOffCents !== null ? web.oneOffCents + automation.oneOffCents : null

  const ALL: ('automation' | 'web' | 'shared')[] = ['automation', 'web', 'shared']
  const anythingRecorded = recurring !== null && costCents !== null && anythingIn(inp, ctx, ALL, M, today)
  let net: Leaves
  if (recurring === null || costCents === null) net = { kind: 'unreadable' }
  else if (!anythingRecorded) net = { kind: 'nothing' }
  else if (phase.kind === 'in_progress') {
    const prev = addMonths(M, -1)
    const pm = buildMonth(inp, prev, today) // today is past prev's last day, so prev is closed
    const pn = pm.sums.recurringCents !== null && pm.sums.costCents !== null ? pm.sums.recurringCents - pm.sums.costCents : null
    net = { kind: 'withheld', lastClosed: pn === null || !anythingIn(inp, ctx, ALL, prev, today) ? null : { month: prev, cents: pn } }
  } else net = { kind: 'value', cents: recurring - costCents, completeFromDayOne: false }

  const neverAnything =
    inp.contracts !== null && inp.payments !== null && inp.costs !== null &&
    !web.everContracted && !automation.everContracted &&
    (inp.payments ?? []).filter((p) => ctx.realParties.has(partyOf(p))).length === 0 &&
    (inp.costs ?? []).length === 0

  return {
    month: M,
    phase,
    today,
    halves: { web, automation },
    company: { costs: companyCosts, costCents: companyCents },
    sums: {
      recurringCents: recurring,
      composition: recurring === null ? null : { web: web.recurringCents ?? 0, automation: automation.recurringCents ?? 0 },
      oneOffCents: oneOff,
      costCents,
      fixedCents,
      net,
      anythingRecorded,
    },
    neverAnything,
    failed: [...new Set([...web.failed, ...automation.failed, ...(companyCosts === null ? ['costs'] : [])])],
  }
}
