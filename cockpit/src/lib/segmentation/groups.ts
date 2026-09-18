import { plural, STATE_LABEL } from '@/lib/segmentation/copy'

/**
 * Grouping contacts the way an agency remembers them.
 *
 * Our segments are legal categories. Their memory is episodic — "the export
 * from the old website form", "the people from the 2023 open days". So the
 * screen groups first and asks second, and the groups are built from whatever
 * the data supports, ordered by how strongly each is likely to jog a memory.
 *
 * Pure: rows in, groups out. No database, no rendering.
 */

export type ContactRow = {
  id: string
  phone: string
  fullName: string | null
  lastContactAt: string | null
  area: string | null
  batchId: string | null
  batchFilename: string | null
  batchCommittedAt: string | null
  /** From consent_by_contact. Internal vocabulary; never rendered raw. */
  state: string
  /**
   * The exact cell the agency's file held — or null when a claim exists and its
   * text was NOT RETAINED. Never a substitute: quoting a cell we do not have
   * back to the person whose file it came from is the one thing the hard
   * question cannot afford.
   */
  claimRaw: string | null
  /** Whether there is a claim at all, which is a different fact from its text. */
  hasClaim: boolean
}

export type Group = {
  id: string
  kind: 'batch' | 'year' | 'area' | 'unknown'
  /** Portuguese, for the screen. Built from data, never from our vocabulary. */
  label: string
  contactIds: string[]
  /** How many carry a claim we could not evidence — drives the hard question. */
  withClaim: number
  /**
   * A suggestion, shown as TEXT beside unselected choices. Never a default
   * selection: the Enquadramento requires the system to propose and the agency
   * to confirm, and a pre-ticked option collects a click rather than a decision
   * (§11d).
   */
  proposal: { segment: 'A' | 'B' | 'C' | 'D'; why: string } | null
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : null
}

/**
 * Groups, strongest memory cue first.
 *
 * A contact appears in exactly ONE group. Overlapping groups would let the same
 * person be declared twice in one sitting, with two different answers and no
 * way to tell which the agency meant.
 */
export function proposeGroups(contacts: ContactRow[]): Group[] {
  const groups: Group[] = []
  const taken = new Set<string>()

  const build = (
    id: string, kind: Group['kind'], label: string, rows: ContactRow[],
    proposal: Group['proposal'],
  ) => {
    const fresh = rows.filter((r) => !taken.has(r.id))
    if (fresh.length === 0) return
    for (const r of fresh) taken.add(r.id)
    groups.push({
      id, kind, label,
      contactIds: fresh.map((r) => r.id),
      withClaim: fresh.filter((r) => r.hasClaim).length,
      proposal,
    })
  }

  // 1. Import batch — the strongest cue, because they chose the file.
  const byBatch = new Map<string, ContactRow[]>()
  for (const c of contacts) if (c.batchId) {
    byBatch.set(c.batchId, [...(byBatch.get(c.batchId) ?? []), c])
  }
  for (const [batchId, rows] of [...byBatch].sort((a, b) => b[1].length - a[1].length)) {
    const when = shortDate(rows[0].batchCommittedAt)
    const file = rows[0].batchFilename
    build(
      `batch:${batchId}`, 'batch',
      [plural(rows.length, 'contacto', 'contactos'), file,
       when ? `${rows.length === 1 ? 'importado' : 'importados'} ${when}` : null]
        .filter(Boolean).join(' · '),
      rows,
      null,
    )
  }

  // 2. Year of last contact.
  const byYear = new Map<string, ContactRow[]>()
  for (const c of contacts) if (!taken.has(c.id) && c.lastContactAt) {
    const y = c.lastContactAt.slice(0, 4)
    byYear.set(y, [...(byYear.get(y) ?? []), c])
  }
  for (const [year, rows] of [...byYear].sort((a, b) => b[0].localeCompare(a[0]))) {
    build(`year:${year}`, 'year',
      `${plural(rows.length, 'contacto', 'contactos')} · última conversa em ${year}`, rows, null)
  }

  // 3. Area.
  const byArea = new Map<string, ContactRow[]>()
  for (const c of contacts) if (!taken.has(c.id) && c.area) {
    byArea.set(c.area, [...(byArea.get(c.area) ?? []), c])
  }
  for (const [area, rows] of [...byArea].sort((a, b) => b[1].length - a[1].length)) {
    build(`area:${area}`, 'area', `${plural(rows.length, 'contacto', 'contactos')} · ${area}`, rows, null)
  }

  // 4. Whatever is left, which is honest rather than tidy.
  const rest = contacts.filter((c) => !taken.has(c.id))
  build('rest', 'unknown',
    `${plural(rest.length, 'contacto', 'contactos')} sem nada em comum que possamos ver`, rest, null)

  return groups
}

/** A contact as the screen shows it: no internal vocabulary reaches the page. */
export function describeContact(c: ContactRow): { name: string; phone: string; state: string } {
  return {
    name: c.fullName ?? 'Sem nome no ficheiro',
    phone: c.phone,
    state: STATE_LABEL[c.state] ?? STATE_LABEL.undetermined,
  }
}

/**
 * The cell a group may quote, or null.
 *
 * Null when nothing was retained AND when the group's claims disagree: a group
 * holding «sim» and «y» has no single cell, and picking either one shows the
 * agency a quotation that is wrong for half the rows under it.
 */
export function sharedClaimCell(rows: ContactRow[]): string | null {
  const distinct = new Set(rows.map((r) => r.claimRaw).filter((x): x is string => x !== null))
  return distinct.size === 1 ? [...distinct][0] : null
}
