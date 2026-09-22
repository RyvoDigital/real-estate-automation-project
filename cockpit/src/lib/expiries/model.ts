/**
 * Expiring things: THE one source (operator, 22 Sep 2026). Today's groups 3
 * and 4 read it now; /ops/expiries (brief §2.3, route map, build stage C5) will
 * read it too, so there is one account of what has run out and what is about
 * to, never two that can disagree.
 *
 * PURE: facts in, three lists out. The reads are in ./read.ts;
 * tests/expiries-model.test.ts holds every rule.
 *
 * What it covers today, and says so (it is PARTIAL, and every consumer must
 * say so too):
 *   tracked      the n8n deploy key (0051, health_runs.n8n_api_key_exp); every
 *                client's dated property documents and agency registrations,
 *                through the SAME classifier "What is still good" uses
 *                (publication/still-good.ts, never re-derived here)
 *   not tracked  clearances (no clearances table and nothing writes one);
 *                Ryvo's other own expiries (the domain, the certidão, the
 *                procuração, the payment cards: C5, with their table)
 *
 *   🔒 Three lists that do not merge (brief §2.3): run out, about to run out,
 *      to confirm. A registration is keyed by the registration, never by the
 *      property.
 *   🔒 Warns at 30 days (still-good.ts WARN_WITHIN_DAYS), the same figure for
 *      Ryvo's own key and a client's certificate.
 *   🔒 An automatic source that has not been read recently is NOT a clean date:
 *      it is "unknown" with its age (brief §2.3, the stale-sweep rule).
 *   🔒 A read that failed is a failure named in `failures`, never an empty list.
 */

import { WARN_WITHIN_DAYS, type StillGood } from '@/lib/publication/still-good'
import type { Recheck, LapseCause } from '@/lib/publication/recheck'

export type ExpiryStanding = 'past' | 'soon' | 'good' | 'to_confirm' | 'not_valid' | 'unknown' | 'no_expiry'

export type ExpiryItem = {
  key: string
  kind: 'deploy_key' | 'domain' | 'certidao' | 'procuracao' | 'payment_card' | 'property_document' | 'registration' | 'clearance'
  /** whose obligation it is: Ryvo's own, or a client's */
  owner: { kind: 'ryvo' } | { kind: 'client'; id: string; name: string }
  /** what it is, in words */
  what: string
  standing: ExpiryStanding
  /** the date it expires or expired; null when there is none to state */
  date: string | null
  /** days left (negative once past); null when not a date-based item */
  days: number | null
  /** one supporting line: why it is to confirm, or how old the source is */
  note: string | null
  /** a manual Ryvo obligation's chain, so /ops/expiries can check, renew, correct or retire it */
  obligation?: ObligationCurrent
  /** a lapsed clearance's causes, EVERY one (brief §2.3: never the first found) */
  causes?: LapseCause[]
}

/** The head of a ryvo_obligations chain (0058), as ryvo_obligations_current returns it. */
export type ObligationCurrent = {
  id: string; obligation_id: string; act: string
  kind: 'certidao' | 'procuracao' | 'payment_card'; label: string
  expires_on: string | null; no_expiry_stated: boolean
  card_brand: string | null; card_last_four: string | null; card_exp_month: number | null; card_exp_year: number | null
  services: string[] | null; note: string | null; recorded_by: string; recorded_at: string
}

export type ExpiriesInputs = {
  /** the latest health run's reading of the deploy key; null = the read failed */
  deployKey: { exp: string | null; readAt: string } | null | 'no_run'
  /** every client's still-good classification; null for one client = its read failed */
  clients: { id: string; name: string; stillGood: StillGood | null }[] | null
  /** the domain's registry expiry: the last health run that READ it; 'never' = no run has; null = the read failed */
  domain?: { expiresOn: string; readAt: string } | 'never' | null
  /** Ryvo's own manual obligations (0058), the heads; null = the read failed */
  obligations?: ObligationCurrent[] | null
  /** each client's clearances, re-checked (publication/recheck.ts); null = the read failed; null for one client = its read failed */
  clearances?: { id: string; name: string; recheck: Recheck | null }[] | null
  now: Date
}

export type Expiries = {
  /** past their date, or a registration known suspended/cancelled: most overdue first */
  runOut: ExpiryItem[]
  /** within WARN_WITHIN_DAYS: fewest days left first */
  aboutTo: ExpiryItem[]
  /** registrations never checked, or checked too long ago: longest unchecked first */
  toConfirm: ExpiryItem[]
  /** everything read, by kind, for the denominators */
  checked: { deployKeys: number; domains: number; documents: number; registrations: number; clients: number; obligations: number; clearances: number; stillGoodClearances: number }
  /** 🔒 Ryvo's own, every one whatever its standing (good ones too): /ops/expiries' own table, never a client's slice */
  ryvoOwn: ExpiryItem[]
  /** 🔴 what a clearance re-check could NOT look for, per client (brief §2.3 S3): never shown as a clean result */
  notCheckedFor: { client: string; causes: LapseCause[] }[]
  tracked: string[]
  notTracked: string[]
  failures: string[]
  warnWithinDays: number
}

/** healthcheck.sh runs every 10 minutes; a reading older than this is not a current one */
export const DEPLOY_KEY_STALE_AFTER_HOURS = 2

const DAY = 86_400_000
const daysUntil = (now: Date, iso: string) => {
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - a) / DAY)
}
const age = (ms: number) => {
  const h = Math.floor(ms / 3_600_000)
  return h < 48 ? `${h} hour${h === 1 ? '' : 's'}` : `${Math.floor(h / 24)} days`
}

/**
 * 🔒 ONE LIST, TWO SENTENCES. Today prints what is tracked ("this tracks …")
 * and what was counted ("checked …"); on 22 Sep 2026 the second was narrower
 * than the first, which reads as a complete count of an incomplete set. Both
 * sentences are now built from THIS list, so a tracked thing that nothing
 * counts cannot be written, and tests/today-model.test.ts fails if they part.
 */
export type TrackedKind = {
  key: string
  /** the words in the partial line: what this screen tracks */
  words: string
  /** the same thing in the count line, or null when this run did not read it */
  counted: (c: Expiries['checked']) => string | null
}
const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const TRACKED_KINDS: TrackedKind[] = [
  { key: 'deploy_key', words: 'the n8n deploy key', counted: (c) => (c.deployKeys ? 'the deploy key' : null) },
  { key: 'domain', words: 'the domain', counted: (c) => (c.domains ? 'the domain' : null) },
  { key: 'obligations', words: 'Ryvo’s certidão, procuração and payment cards', counted: (c) => `${c.obligations} of Ryvo’s own` },
  { key: 'documents', words: 'every client’s dated property documents', counted: (c) => s(c.documents, 'document') },
  { key: 'registrations', words: 'every client’s agency registrations', counted: (c) => s(c.registrations, 'registration') },
  { key: 'clearances', words: 'the clearances the publication gate recorded', counted: (c) => s(c.clearances, 'clearance') },
]

export const TRACKED = TRACKED_KINDS.map((k) => k.words)

/** What was counted, in the order the partial line names it. */
export function countedParts(c: Expiries['checked']): string[] {
  return TRACKED_KINDS.map((k) => k.counted(c)).filter((x): x is string => x !== null)
}
/*
 * 🔴 CORRECTED 22 Sep 2026 (/ops/expiries checkpoint 2). This list said
 * "clearances (there is no clearances table, and nothing writes one)", and Today
 * printed it: false since 0039 was applied and the gate began recording them.
 * Clearances are now re-checked here (publication/recheck.ts), as is every item
 * of Ryvo's own. What is left is brief §2.3's fourth axis, "other expiries".
 */
export const NOT_TRACKED = [
  'template approvals, obligation discharges and sender quality (brief §2.3, "other expiries")',
]

/** healthcheck.sh reads RDAP every ten minutes; a reading older than this is not a current one */
export const DOMAIN_STALE_AFTER_HOURS = 2

/** The last day of a card's expiry month, the day it stops working. */
export function cardLastDay(month: number, year: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

export function buildExpiries(i: ExpiriesInputs): Expiries {
  const runOut: ExpiryItem[] = [], aboutTo: ExpiryItem[] = [], toConfirm: ExpiryItem[] = []
  const failures: string[] = []
  const checked = { deployKeys: 0, domains: 0, documents: 0, registrations: 0, clients: 0, obligations: 0, clearances: 0, stillGoodClearances: 0 }
  const ryvo = { kind: 'ryvo' as const }
  const ryvoOwn: ExpiryItem[] = []
  const notCheckedFor: Expiries['notCheckedFor'] = []
  /** One of Ryvo's own: kept in its own table whatever its standing, and placed in a list when it is due. */
  const placeRyvo = (item: ExpiryItem) => {
    ryvoOwn.push(item)
    if (item.standing === 'past') runOut.push(item)
    else if (item.standing === 'soon' || item.standing === 'unknown') aboutTo.push(item)
  }
  const dated = (date: string) => {
    const days = daysUntil(i.now, date)
    return { date: date.slice(0, 10), days, standing: (days < 0 ? 'past' : days <= WARN_WITHIN_DAYS ? 'soon' : 'good') as ExpiryStanding }
  }

  // ── Ryvo's own: the deploy key ─────────────────────────────────────────────
  if (i.deployKey === null) failures.push('The deploy key’s expiry could not be read (health_runs).')
  else if (i.deployKey === 'no_run') failures.push('No health run has recorded the deploy key’s expiry yet.')
  else {
    checked.deployKeys = 1
    const stale = i.now.getTime() - Date.parse(i.deployKey.readAt) > DEPLOY_KEY_STALE_AFTER_HOURS * 3_600_000
    const base = { key: 'deploy-key', kind: 'deploy_key' as const, owner: ryvo, what: 'The n8n deploy key' }
    if (!i.deployKey.exp) placeRyvo({ ...base, standing: 'unknown', date: null, days: null, note: 'The last health run could not read its expiry.' })
    else if (stale) {
      placeRyvo({ ...base, standing: 'unknown', date: i.deployKey.exp.slice(0, 10), days: null,
        note: `Not read for ${age(i.now.getTime() - Date.parse(i.deployKey.readAt))}, so this date is not asserted.` })
    } else placeRyvo({ ...base, ...dated(i.deployKey.exp), note: null })
  }

  // ── Ryvo's own: the domain (RDAP, via healthcheck.sh; 0058) ───────────────
  if (i.domain !== undefined) {
    const base = { key: 'domain', kind: 'domain' as const, owner: ryvo, what: 'ryvodigital.com' }
    if (i.domain === null) failures.push('The domain’s expiry could not be read (health_runs).')
    else if (i.domain === 'never') placeRyvo({ ...base, standing: 'unknown', date: null, days: null, note: 'No health run has read the registry yet.' })
    else {
      const ageMs = i.now.getTime() - Date.parse(i.domain.readAt)
      // 🔒 A source not read recently is UNKNOWN with its age, never a clean date (§2.3).
      checked.domains = 1
      if (ageMs > DOMAIN_STALE_AFTER_HOURS * 3_600_000) {
        placeRyvo({ ...base, standing: 'unknown', date: i.domain.expiresOn, days: null, note: `The registry was last read ${age(ageMs)} ago, so this date is not asserted.` })
      } else placeRyvo({ ...base, ...dated(i.domain.expiresOn), note: 'From the registry (RDAP).' })
    }
  }

  // ── Ryvo's own: the certidão, the procuração, the cards (0058) ────────────
  if (i.obligations === null) failures.push('Ryvo’s own obligations could not be read (ryvo_obligations).')
  else for (const o of i.obligations ?? []) {
    checked.obligations += 1
    const base = { key: `obl:${o.obligation_id}`, kind: o.kind, owner: ryvo, what: o.label, obligation: o }
    if (o.kind === 'payment_card') {
      const last = cardLastDay(o.card_exp_month ?? 1, o.card_exp_year ?? 2000)
      placeRyvo({ ...base, ...dated(last), note: `${o.card_brand} ····${o.card_last_four}, expires ${String(o.card_exp_month).padStart(2, '0')}/${o.card_exp_year}. Charged to: ${(o.services ?? []).join(', ')}.` })
    } else if (o.no_expiry_stated) {
      // 🔒 "No expiry stated", in words: never a blank, never in a list as if it were a date.
      placeRyvo({ ...base, standing: 'no_expiry', date: null, days: null, note: 'The document states no expiry.' })
    } else if (o.expires_on) placeRyvo({ ...base, ...dated(o.expires_on), note: null })
  }

  // ── every client's documents and registrations, through still-good ─────────
  if (i.clients === null) failures.push('The clients could not be read, so no client’s documents were checked.')
  else for (const c of i.clients) {
    if (!c.stillGood) { failures.push(`${c.name}: the documents and registrations could not be read.`); continue }
    checked.clients += 1
    const owner = { kind: 'client' as const, id: c.id, name: c.name }
    for (const d of c.stillGood.documents) {
      checked.documents += 1
      const item: ExpiryItem = { key: `doc:${d.listingId}:${d.requirementId}`, kind: 'property_document', owner,
        what: `${d.requirementId.replace(/_/g, ' ')}${d.reference ? ` · ${d.reference}` : ''}${d.certificateNumber ? ` · n.º ${d.certificateNumber}` : ''}`,
        date: d.validUntil.slice(0, 10), days: d.daysLeft, standing: d.standing, note: null }
      if (d.standing === 'past') runOut.push(item)
      else if (d.standing === 'soon') aboutTo.push(item)
    }
    for (const r of c.stillGood.registrations) {
      checked.registrations += 1
      const base = { key: `reg:${c.id}:${r.requirementId}:${r.number}`, kind: 'registration' as const, owner,
        what: `${r.requirementId.replace(/_/g, ' ')} ${r.number}${r.region ? ` · ${r.region}` : ''}`, date: null, days: null }
      if (r.standing === 'not_valid') runOut.push({ ...base, standing: 'not_valid', note: 'The register says it is suspended or cancelled.' })
      else if (r.standing === 'never_checked') toConfirm.push({ ...base, standing: 'to_confirm', note: 'Typed, and never checked against the register.' })
      else if (r.standing === 'stale') toConfirm.push({ ...base, standing: 'to_confirm', note: `Last checked ${r.daysSinceChecked} days ago; no longer asserted.`, days: r.daysSinceChecked })
    }
  }

  // ── every client's clearances, re-checked (publication/recheck.ts) ───────
  if (i.clearances === null) failures.push('The clearances could not be read, so none was re-checked.')
  else for (const c of i.clearances ?? []) {
    if (!c.recheck) { failures.push(`${c.name}: the clearances could not be re-checked.`); continue }
    const owner = { kind: 'client' as const, id: c.id, name: c.name }
    checked.clearances += c.recheck.checked
    checked.stillGoodClearances += c.recheck.stillGood
    // 🔴 What the run could not look for is SAID, per client (S3): never a clean bill.
    if (c.recheck.notCheckedFor.length) notCheckedFor.push({ client: c.name, causes: c.recheck.notCheckedFor })
    for (const l of c.recheck.lapsed) {
      runOut.push({ key: `clr:${l.clearanceId}`, kind: 'clearance', owner, what: l.reference ?? `property ${l.listingId.slice(0, 8)}`,
        standing: 'past', date: l.since, days: l.daysAgo === null ? null : -l.daysAgo, causes: l.causes,
        note: l.noticeSentAt ? `The agency was told on ${l.noticeSentAt.slice(0, 10)}.` : 'The agency has not been told.' })
    }
    for (const e of c.recheck.expiringSoon) {
      aboutTo.push({ key: `clr:${e.clearanceId}`, kind: 'clearance', owner, what: e.reference ?? `property ${e.listingId.slice(0, 8)}`,
        standing: 'soon', date: e.expiresOn, days: e.daysLeft, note: null })
    }
  }

  // Each list by its OWN clock.
  runOut.sort((a, b) => (a.days ?? 0) - (b.days ?? 0))                           // most overdue first
  aboutTo.sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER)) // fewest days left first; unknown last
  toConfirm.sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER)) // never checked first, then longest

  // Ryvo's own table: soonest first, "no expiry stated" and unknowns last, in the order read.
  ryvoOwn.sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER))
  return { runOut, aboutTo, toConfirm, checked, ryvoOwn, notCheckedFor, tracked: TRACKED, notTracked: NOT_TRACKED, failures, warnWithinDays: WARN_WITHIN_DAYS }
}
