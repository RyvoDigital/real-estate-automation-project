/*
 * The Month's three entries — a contract, a payment, a cost. Brief I §2.10
 * ("What a person must enter, and when — nothing else") and §2.11.
 *
 * PURE: parsing and validation, and a save core that is handed the database
 * and the revalidation, so both are tested with fakes (tests/month-entry.test.ts)
 * and nothing here can reach production by itself. lib/month/actions.ts is the
 * thin server-action wrapper that supplies the real ones.
 *
 * 🔒 After a save the page is current with no reload (operator, 21 Sep 2026):
 * the core calls revalidate('/') only after the insert succeeded, and Next
 * re-renders the route in the same response. 🔒 A failed save keeps what was
 * typed: every result carries the submitted values back to the form.
 *
 * Every amount is NET OF VAT, and the form says so at the field (§2.10).
 * Contracts are append-only (0050): a correction or an end is a NEW row whose
 * supersedes_id names the old one, never an edit.
 */

export type EntryKind = 'contract' | 'payment' | 'cost'
export type Values = Record<string, string>
export type EntryResult = { ok: boolean; message: string; values: Values; errors: Record<string, string> }
export const EMPTY: EntryResult = { ok: true, message: '', values: {}, errors: {} }

export const AUTOMATIONS = ['inbound_concierge', 'db_reactivation', 'lead_nurture', 'listing_launch', 'reputation_loop'] as const
export const PAYMENT_KINDS = ['setup', 'project', 'monthly', 'other'] as const
export const COST_CATEGORIES = ['infrastructure', 'messaging', 'model', 'tooling', 'hosting', 'domain', 'other'] as const
export const COST_SIDES = ['automation', 'web', 'shared'] as const
export const CADENCES = ['monthly', 'annual', 'one_off'] as const

/** "1 234,50", "1234.5", "€ 60" → "1234.50". Null when it is not an amount; never a guess. */
export function parseAmount(raw: string | undefined): string | null {
  if (raw === undefined) return null
  let s = raw.replace(/[€\s ]/g, '')
  if (!s) return null
  // One comma and no dot: the comma is the decimal separator (Portuguese).
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.')
  // Both: the last one is the decimal separator, the other groups thousands.
  else if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  return Number(s).toFixed(2)
}

const isDate = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
const trim = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '')

export function valuesOf(form: FormData, keys: string[]): Values {
  const out: Values = {}
  for (const k of keys) out[k] = k === 'automations' ? form.getAll(k).map(String).join(',') : trim(form.get(k))
  return out
}

export const FIELDS: Record<EntryKind, string[]> = {
  contract: ['party', 'monthly_eur', 'setup_eur', 'setup_terms', 'starts_on', 'ends_on', 'automations', 'signed_by', 'supersedes_id'],
  payment: ['party', 'kind', 'amount_eur', 'invoiced_on', 'settled_on', 'settled_amount_eur', 'reference', 'note'],
  cost: ['label', 'category', 'side', 'amount_eur', 'cadence', 'started_on', 'ended_on', 'party'],
}

/** "a:<uuid>" is an automation client, "w:<uuid>" a web client — one field, never two that could disagree. */
export function parseParty(v: string): { automation_client_id: string | null; web_client_id: string | null } | null {
  const m = v.match(/^([aw]):([0-9a-f-]{36})$/i)
  if (!m) return null
  return m[1] === 'a' ? { automation_client_id: m[2], web_client_id: null } : { automation_client_id: null, web_client_id: m[2] }
}

type Row = Record<string, unknown>
export type Validated = { ok: true; table: 'client_contracts' | 'payments' | 'costs'; row: Row } | { ok: false; errors: Record<string, string> }

export function validate(kind: EntryKind, v: Values, recordedBy: string, opts: { clientCostsRecordable: boolean }): Validated {
  const e: Record<string, string> = {}
  if (kind === 'contract') {
    const party = parseParty(v.party)
    if (!party) e.party = 'Choose the client.'
    const monthly = parseAmount(v.monthly_eur)
    if (monthly === null) e.monthly_eur = 'A monthly fee, net of VAT — e.g. 650 or 650,00.'
    const setup = v.setup_eur ? parseAmount(v.setup_eur) : null
    if (v.setup_eur && setup === null) e.setup_eur = 'Not an amount.'
    if (!isDate(v.starts_on)) e.starts_on = 'When billing starts.'
    if (v.ends_on && !isDate(v.ends_on)) e.ends_on = 'Not a date.'
    if (isDate(v.starts_on) && isDate(v.ends_on) && v.ends_on < v.starts_on) e.ends_on = 'Ends before it starts.'
    const automations = v.automations ? v.automations.split(',').filter(Boolean) : []
    if (automations.some((a) => !(AUTOMATIONS as readonly string[]).includes(a))) e.automations = 'An unknown automation.'
    if (party?.web_client_id && automations.length) e.automations = 'A web client’s contract covers no automations.'
    if (!v.signed_by) e.signed_by = 'Who signed it, on the client’s side.'
    if (v.supersedes_id && !/^[0-9a-f-]{36}$/i.test(v.supersedes_id)) e.supersedes_id = 'Not a contract.'
    if (Object.keys(e).length) return { ok: false, errors: e }
    return {
      ok: true, table: 'client_contracts',
      row: {
        ...party, monthly_eur: monthly, setup_eur: setup, setup_terms: v.setup_terms || null,
        starts_on: v.starts_on, ends_on: v.ends_on || null,
        automations: party!.automation_client_id ? (automations.length ? automations : null) : null,
        signed_by: v.signed_by, recorded_by: recordedBy, supersedes_id: v.supersedes_id || null,
      },
    }
  }
  if (kind === 'payment') {
    const party = parseParty(v.party)
    if (!party) e.party = 'Choose the client.'
    if (!(PAYMENT_KINDS as readonly string[]).includes(v.kind)) e.kind = 'Choose what it is for.'
    const amount = parseAmount(v.amount_eur)
    if (amount === null || Number(amount) <= 0) e.amount_eur = 'The amount, net of VAT, above zero.'
    if (v.invoiced_on && !isDate(v.invoiced_on)) e.invoiced_on = 'Not a date.'
    // 0043's rule, said at the form: the money arrived on a date AND in an amount, or neither.
    const settledAmount = v.settled_amount_eur ? parseAmount(v.settled_amount_eur) : null
    if (v.settled_on && !isDate(v.settled_on)) e.settled_on = 'Not a date.'
    if (v.settled_amount_eur && settledAmount === null) e.settled_amount_eur = 'Not an amount.'
    if (!!v.settled_on !== !!v.settled_amount_eur) e.settled_on = 'When it arrived and how much — both, or neither.'
    if (Object.keys(e).length) return { ok: false, errors: e }
    return {
      ok: true, table: 'payments',
      row: {
        ...party, kind: v.kind, amount_eur: amount, invoiced_on: v.invoiced_on || null,
        settled_on: v.settled_on || null, settled_amount_eur: settledAmount,
        reference: v.reference || null, note: v.note || null, recorded_by: recordedBy,
      },
    }
  }
  // cost
  if (!v.label) e.label = 'What it is.'
  if (!(COST_CATEGORIES as readonly string[]).includes(v.category)) e.category = 'Choose a category.'
  if (!(COST_SIDES as readonly string[]).includes(v.side)) e.side = 'Whose cost it is.'
  const amount = parseAmount(v.amount_eur)
  if (amount === null) e.amount_eur = 'The amount, net of VAT.'
  if (!(CADENCES as readonly string[]).includes(v.cadence)) e.cadence = 'How often.'
  if (!isDate(v.started_on)) e.started_on = 'When it started.'
  if (v.ended_on && !isDate(v.ended_on)) e.ended_on = 'Not a date.'
  let party: ReturnType<typeof parseParty> = null
  if (v.party) {
    if (!opts.clientCostsRecordable) e.party = 'A single client’s cost needs migration 0052 first.'
    party = parseParty(v.party)
    if (!party) e.party = 'Choose the client.'
    else if ((party.automation_client_id && v.side !== 'automation') || (party.web_client_id && v.side !== 'web')) {
      e.party = 'A client’s cost belongs to its own business.'
    }
  }
  if (Object.keys(e).length) return { ok: false, errors: e }
  return {
    ok: true, table: 'costs',
    row: {
      label: v.label, category: v.category, side: v.side, amount_eur: amount, cadence: v.cadence,
      started_on: v.started_on, ended_on: v.ended_on || null, recorded_by: recordedBy,
      ...(party ?? {}),
    },
  }
}

export type Insert = (table: string, row: Row) => Promise<{ error: { message: string } | null }>

/** The save, with its database and revalidation injected. Revalidates only after a successful insert. */
export async function save(
  kind: EntryKind, form: FormData, recordedBy: string,
  deps: { insert: Insert; revalidate: (path: string) => void; clientCostsRecordable: boolean },
): Promise<EntryResult> {
  const values = valuesOf(form, FIELDS[kind])
  const checked = validate(kind, values, recordedBy, { clientCostsRecordable: deps.clientCostsRecordable })
  if (!checked.ok) return { ok: false, message: 'Not saved — check the fields marked.', values, errors: checked.errors }
  let error: { message: string } | null
  try {
    ;({ error } = await deps.insert(checked.table, checked.row))
  } catch (e) {
    error = { message: (e as Error).message }
  }
  if (error) return { ok: false, message: `Not saved — the database refused it: ${error.message}`, values, errors: {} }
  deps.revalidate('/')
  return { ok: true, message: `${kind === 'contract' ? 'Contract' : kind === 'payment' ? 'Payment' : 'Cost'} saved.`, values: {}, errors: {} }
}
