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

export type ExpiryStanding = 'past' | 'soon' | 'good' | 'to_confirm' | 'not_valid' | 'unknown'

export type ExpiryItem = {
  key: string
  kind: 'deploy_key' | 'property_document' | 'registration'
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
}

export type ExpiriesInputs = {
  /** the latest health run's reading of the deploy key; null = the read failed */
  deployKey: { exp: string | null; readAt: string } | null | 'no_run'
  /** every client's still-good classification; null for one client = its read failed */
  clients: { id: string; name: string; stillGood: StillGood | null }[] | null
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
  checked: { deployKeys: number; documents: number; registrations: number; clients: number }
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

export const TRACKED = [
  'the n8n deploy key',
  'every client’s dated property documents',
  'every client’s agency registrations',
]
export const NOT_TRACKED = [
  'clearances (there is no clearances table, and nothing writes one)',
  'Ryvo’s other own expiries: the domain, the certidão, the procuração and the payment cards (build stage C5)',
]

export function buildExpiries(i: ExpiriesInputs): Expiries {
  const runOut: ExpiryItem[] = [], aboutTo: ExpiryItem[] = [], toConfirm: ExpiryItem[] = []
  const failures: string[] = []
  const checked = { deployKeys: 0, documents: 0, registrations: 0, clients: 0 }
  const ryvo = { kind: 'ryvo' as const }

  // ── Ryvo's own: the deploy key ─────────────────────────────────────────────
  if (i.deployKey === null) failures.push('The deploy key’s expiry could not be read (health_runs).')
  else if (i.deployKey === 'no_run') failures.push('No health run has recorded the deploy key’s expiry yet.')
  else {
    checked.deployKeys = 1
    const stale = i.now.getTime() - Date.parse(i.deployKey.readAt) > DEPLOY_KEY_STALE_AFTER_HOURS * 3_600_000
    if (!i.deployKey.exp) {
      aboutTo.push({ key: 'deploy-key', kind: 'deploy_key', owner: ryvo, what: 'The n8n deploy key', standing: 'unknown', date: null, days: null,
        note: 'The last health run could not read its expiry.' })
    } else if (stale) {
      aboutTo.push({ key: 'deploy-key', kind: 'deploy_key', owner: ryvo, what: 'The n8n deploy key', standing: 'unknown', date: i.deployKey.exp.slice(0, 10), days: null,
        note: `Not read for ${age(i.now.getTime() - Date.parse(i.deployKey.readAt))}, so this date is not asserted.` })
    } else {
      const days = daysUntil(i.now, i.deployKey.exp)
      const item: ExpiryItem = { key: 'deploy-key', kind: 'deploy_key', owner: ryvo, what: 'The n8n deploy key', date: i.deployKey.exp.slice(0, 10), days,
        standing: days < 0 ? 'past' : days <= WARN_WITHIN_DAYS ? 'soon' : 'good', note: null }
      if (item.standing === 'past') runOut.push(item)
      else if (item.standing === 'soon') aboutTo.push(item)
    }
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

  // Each list by its OWN clock.
  runOut.sort((a, b) => (a.days ?? 0) - (b.days ?? 0))                           // most overdue first
  aboutTo.sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER)) // fewest days left first; unknown last
  toConfirm.sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER)) // never checked first, then longest

  return { runOut, aboutTo, toConfirm, checked, tracked: TRACKED, notTracked: NOT_TRACKED, failures, warnWithinDays: WARN_WITHIN_DAYS }
}
