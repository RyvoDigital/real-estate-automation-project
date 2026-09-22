/**
 * Ryvo's own expiries, written: the certidão, the procuração, the payment cards
 * (brief §2.3 "Ryvo's own"; /ops/expiries checkpoint 1, 22 Sep 2026). A pure
 * core: the one store verb is passed in; tests/obligations-core.test.ts drives
 * every path. The rules are the same ones 0058 enforces, checked here first so
 * the operator reads a sentence rather than a constraint name.
 *
 *   🔒 APPEND-ONLY CHAINS. An obligation is `entered` once; every later fact is a
 *      NEW row superseding the head: `corrected`, `checked` (looked again,
 *      nothing changed: "last checked"), `renewed`, `retired`. Nothing is edited.
 *   🔒 THE PROCURAÇÃO IS A DATE OR "NO EXPIRY STATED", ANSWERED: never a blank,
 *      never a default. The yes/no arrives from two radios nobody pre-selects.
 *   🔴 NEVER A CARD NUMBER. Brand, the last four, month/year and the services
 *      only. A run of 13+ digits (spaces and dashes ignored, not written as a
 *      phone) in ANY free field is refused, and the refusal carries NO params,
 *      so a pasted number is not echoed back into a URL either. Card numbers are
 *      13-19 digits; an 8-digit rule refused a date and a 12-digit one a phone
 *      with its country code (both found in the tests, 22 Sep 2026).
 *   🔒 ONCE: the act's id is minted when the form is drawn (the pkey). Two forms
 *      racing on the same head: the loser hits ryvo_obligations_one_successor_each,
 *      "someone else just changed this", never "already recorded".
 *   🔒 NOTHING THROWS: refusals are keys (lib/refusals.ts), said by the screen.
 */
import type { Refusal } from '@/lib/refusals'
import type { ObligationRefusalKey } from './copy'

export type ObligationKind = 'certidao' | 'procuracao' | 'payment_card'
export type ObligationAct = 'entered' | 'corrected' | 'checked' | 'renewed' | 'retired'
export type ObligationRefusal = Refusal<ObligationRefusalKey>

/** The form, exactly as submitted. */
export type ObligationForm = {
  actId: string | null
  /** the chain; absent on an entry (the entry's own id becomes the chain) */
  obligationId: string | null
  /** the head this act supersedes; absent on an entry */
  supersedesId: string | null
  act: string | null
  kind: string | null
  label: string | null
  expiresOn: string | null
  /** the procuração's answer: 'yes' | 'no', from radios with no default */
  noExpiryStated: string | null
  cardBrand: string | null
  cardLastFour: string | null
  cardExpMonth: string | null
  cardExpYear: string | null
  /** 🔒 a retirement's second step: 'yes', from a box nobody ticks in advance */
  confirm: string | null
  /** one service per line, or comma-separated */
  services: string | null
  note: string | null
}

export type ObligationRow = {
  id: string; obligation_id: string; supersedes_id: string | null
  act: ObligationAct; kind: ObligationKind; label: string
  expires_on: string | null; no_expiry_stated: boolean
  card_brand: string | null; card_last_four: string | null; card_exp_month: number | null; card_exp_year: number | null
  services: string[] | null
  source: 'manual'; note: string | null; recorded_by: string
}

export type ObligationResult =
  | { ok: true; alreadyRecorded: false; obligationId: string }
  | { ok: true; alreadyRecorded: true }
  | { ok: false; refusal: ObligationRefusal }

export type ObligationDeps = {
  /** 🔒 THE ONE VERB: insert one ryvo_obligations row (0058). */
  insert(row: ObligationRow): Promise<{ error: { code: string | null; message: string } | null }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const KINDS: readonly ObligationKind[] = ['certidao', 'procuracao', 'payment_card']
const ACTS: readonly ObligationAct[] = ['entered', 'corrected', 'checked', 'renewed', 'retired']
export const ONE_ACT_KEY = 'ryvo_obligations_pkey'
export const ONE_SUCCESSOR = 'ryvo_obligations_one_successor_each'

/**
 * 🔴 A card number, or anything shaped like one: a run of 13+ digits once spaces
 * and dashes are taken out, unless it is written as a phone (+...). 0058's
 * no_card_number_anywhere is the same rule.
 */
export function looksLikeACardNumber(text: string | null | undefined): boolean {
  return /(^|[^+\d])\d{13,}/.test((text ?? '').replace(/[\s-]/g, ''))
}

const isRealDate = (s: string) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

/** Validate and build the row. Pure. */
export function buildObligation(form: ObligationForm, recordedBy: string): { ok: true; row: ObligationRow } | { ok: false; refusal: ObligationRefusal } {
  // The card guard FIRST, over every field: nothing below may echo what was typed.
  const fields = [form.label, form.note, form.services, form.cardBrand, form.cardLastFour]
  if (fields.some(looksLikeACardNumber)) return { ok: false, refusal: { key: 'cardNumber' } }

  if (!UUID.test(form.actId ?? '')) return { ok: false, refusal: { key: 'noId' } }
  const act = form.act as ObligationAct
  if (!ACTS.includes(act)) return { ok: false, refusal: { key: 'unknownAct' } }
  const kind = form.kind as ObligationKind
  if (!KINDS.includes(kind)) return { ok: false, refusal: { key: 'unknownKind' } }
  const label = (form.label ?? '').trim()
  if (!label) return { ok: false, refusal: { key: 'noLabel' } }

  const entered = act === 'entered'
  if (!entered && (!UUID.test(form.obligationId ?? '') || !UUID.test(form.supersedesId ?? ''))) return { ok: false, refusal: { key: 'noHead' } }

  const base = {
    id: form.actId!, obligation_id: entered ? form.actId! : form.obligationId!, supersedes_id: entered ? null : form.supersedesId!,
    act, kind, label, source: 'manual' as const, note: (form.note ?? '').trim() || null, recorded_by: recordedBy.trim(),
    expires_on: null as string | null, no_expiry_stated: false,
    card_brand: null as string | null, card_last_four: null as string | null, card_exp_month: null as number | null, card_exp_year: null as number | null,
    services: null as string[] | null,
  }
  /*
   * 🔒 RETIRING IS CONFIRMED, and it is the only act that is (22 Sep 2026).
   * Every other act is a new row that a later row can supersede, so a mistaken
   * check or renewal is corrected by recording the truth. A retirement takes
   * the obligation out of the list and no later act can continue that chain:
   * the way back is to enter it again as a NEW obligation. So it is asked
   * twice, and the second answer is enforced HERE, not only in the markup.
   */
  if (act === 'retired') {
    if (form.confirm !== 'yes') return { ok: false, refusal: { key: 'retireUnconfirmed' } }
    return { ok: true, row: base }
  }

  const date = (form.expiresOn ?? '').trim()
  if (date && !isRealDate(date)) return { ok: false, refusal: { key: 'badDate' } }

  if (kind === 'certidao') {
    if (!date) return { ok: false, refusal: { key: 'certidaoNoDate' } }
    return { ok: true, row: { ...base, expires_on: date } }
  }
  if (kind === 'procuracao') {
    // 🔒 Answered, never assumed: 'yes' or 'no', and it must agree with the date.
    if (form.noExpiryStated !== 'yes' && form.noExpiryStated !== 'no') return { ok: false, refusal: { key: 'procuracaoUnanswered' } }
    const stated = form.noExpiryStated === 'yes'
    if (stated && date) return { ok: false, refusal: { key: 'procuracaoBoth' } }
    if (!stated && !date) return { ok: false, refusal: { key: 'procuracaoNoDate' } }
    return { ok: true, row: { ...base, expires_on: stated ? null : date, no_expiry_stated: stated } }
  }
  // payment_card
  const brand = (form.cardBrand ?? '').trim()
  const last4 = (form.cardLastFour ?? '').trim()
  const month = Number(form.cardExpMonth), year = Number(form.cardExpYear)
  const services = (form.services ?? '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
  if (!brand) return { ok: false, refusal: { key: 'cardNoBrand' } }
  if (!/^\d{4}$/.test(last4)) return { ok: false, refusal: { key: 'cardLastFour' } }
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, refusal: { key: 'cardExpiry' } }
  if (services.length === 0) return { ok: false, refusal: { key: 'cardNoServices' } }
  if (date) return { ok: false, refusal: { key: 'cardHasDate' } }
  return { ok: true, row: { ...base, card_brand: brand, card_last_four: last4, card_exp_month: month, card_exp_year: year, services } }
}

export async function recordObligation(form: ObligationForm, recordedBy: string, deps: ObligationDeps): Promise<ObligationResult> {
  const built = buildObligation(form, recordedBy)
  if (!built.ok) return built
  const { error } = await deps.insert(built.row)
  if (error?.code === '23505' && error.message.includes(ONE_ACT_KEY)) return { ok: true, alreadyRecorded: true }
  if (error?.code === '23505' && error.message.includes(ONE_SUCCESSOR)) return { ok: false, refusal: { key: 'justChanged' } }
  if (error) return { ok: false, refusal: { key: 'dbRefused', params: { code: error.code ?? '?' } } }
  return { ok: true, alreadyRecorded: false, obligationId: built.row.obligation_id }
}
