import Link from 'next/link'

import {
  ANOMALY_VISIBLE,
  anomalyClock,
  splitAnomalies,
  type AnomalyGroup,
  type AnomalyRow,
} from '@/lib/anomaly'
import { IconChevron, IconWarning } from './Icons'

/**
 * Improvements §4.8. The invariants and the error workflow write to `events`
 * and to the operator's phone; this is the same record on the screen someone
 * actually opens in the morning.
 *
 * The severity drives the row's colour AND the hatching, because colour alone
 * fails in sunlight and for a colourblind reader — the queue's system rows
 * already work this way and this list borrows the treatment rather than
 * inventing a second one.
 */

function severityClass(r: AnomalyRow): string {
  return ['row', r.severity === 'critical' ? 'row--t3 row--system' : 'row--t1'].join(' ')
}

function Body({ row, sub }: { row: AnomalyRow; sub: string | null }) {
  return (
    <>
      <span className="row__spine" />
      <span className="row__body">
        <span className="row__name">
          {row.label}
          {row.stage ? <span className="anom__stage">{row.stage.replace('_', ' ')}</span> : null}
        </span>
        <span className="row__why anom__summary">{row.summary}</span>
        {row.textSent && (
          // What the lead was actually sent. The whole point of the invariants
          // is that the text and the row disagreed, so the text is evidence,
          // not decoration — it belongs on the row, not a click away.
          <span className="anom__sent">&ldquo;{row.textSent}&rdquo;</span>
        )}
        {sub && <span className="anom__meta">{sub}</span>}
      </span>
      <span className="row__end">
        <span className="anom__at">{anomalyClock(row.at)}</span>
        <span className={`row__mark chip--${row.severity === 'critical' ? 'system' : 'person'}`}>
          <IconWarning size={12} />
        </span>
      </span>
    </>
  )
}

export function AnomalyItem({
  group,
  leadNames,
}: {
  group: AnomalyGroup
  leadNames: Map<string, string>
}) {
  const row = group.latest
  const bits: string[] = []
  if (row.leadId) bits.push(leadNames.get(row.leadId) ?? 'Unknown lead')
  if (group.count > 1) bits.push(`${group.count}× since ${anomalyClock(group.oldestAt)}`)
  const sub = bits.length ? bits.join(' · ') : null

  const cls = severityClass(row)

  // A lead to open beats an execution to open; a row with neither is still a
  // row, and must not be a dead link that looks live.
  if (row.leadId) {
    return (
      <Link href={`/leads/${row.leadId}`} className={cls}>
        <Body row={row} sub={sub} />
      </Link>
    )
  }
  if (row.executionUrl) {
    return (
      <a href={row.executionUrl} target="_blank" rel="noreferrer" className={cls}>
        <Body row={row} sub={sub} />
      </a>
    )
  }
  return (
    <div className={cls}>
      <Body row={row} sub={sub} />
    </div>
  )
}

/**
 * The expander. Opens in place, keeps nothing between visits, and needs no
 * client component — `<details>` is the boring mechanism the platform already
 * arbitrates (§6), and the report screen already uses it.
 *
 * It STATES THE SEVERITY OF WHAT IT HIDES. Without that, four warnings on top
 * of a folded-away critical would read as a calm screen, which is the burying
 * problem the grouping was built to prevent, reintroduced one layer up.
 */
function AnomalyMore({ count, critical, children }: { count: number; critical: number; children: React.ReactNode }) {
  return (
    <details className={`anom-more${critical > 0 ? ' anom-more--crit' : ''}`}>
      <summary className="anom-more__sum">
        <IconChevron size={14} className="anom-more__chev" />
        <span>{count} more</span>
        {critical > 0 && (
          <span className="anom-more__crit-tag">
            <IconWarning size={12} />
            {critical} critical
          </span>
        )}
      </summary>
      <div className="anom-more__body">{children}</div>
    </details>
  )
}

export function AnomalyList({
  groups,
  total,
  capped,
  leadNames,
  windowDays,
}: {
  groups: AnomalyGroup[]
  total: number
  capped: boolean
  leadNames: Map<string, string>
  windowDays: number
}) {
  // Newest first, four visible; the rest fold away with their severity stated.
  const { shown, hidden, hiddenCritical } = splitAnomalies(groups, (g) => g.latest.severity)

  return (
    <>
      <div className="section">
        <span className="eyebrow">Anomalies · last {windowDays} days</span>
        <hr />
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          {capped ? `${total}+` : total}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="anom-none">
          Nothing has violated an invariant or thrown in {windowDays} days. That is the resting
          state.
        </div>
      ) : (
        <>
          <div className="rows">
            {shown.map((g) => (
              <AnomalyItem key={g.latest.id} group={g} leadNames={leadNames} />
            ))}
          </div>
          {hidden.length > 0 && (
            <AnomalyMore count={hidden.length} critical={hiddenCritical}>
              <div className="rows">
                {hidden.map((g) => (
                  <AnomalyItem key={g.latest.id} group={g} leadNames={leadNames} />
                ))}
              </div>
            </AnomalyMore>
          )}
        </>
      )}
    </>
  )
}

/** The per-lead block: ungrouped, because one lead's anomalies are few and
 *  each occurrence is a separate thing that happened to this person. */
export function LeadAnomalies({ rows }: { rows: AnomalyRow[] }) {
  if (rows.length === 0) return null

  // The panel is a sidebar, so a lead with a run of anomalies pushes
  // everything below it off the screen. Same treatment, same reason.
  const { shown, hidden, hiddenCritical } = splitAnomalies(rows, (r) => r.severity, ANOMALY_VISIBLE)

  const Row = ({ r }: { r: AnomalyRow }) => (
    <div className={`anom-lead__row anom-lead__row--${r.severity}`}>
      <span className="anom-lead__top">
        <span className="anom-lead__label">{r.label}</span>
        <span className="anom__at">{anomalyClock(r.at)}</span>
      </span>
      <span className="anom__summary">{r.summary}</span>
      {r.textSent && <span className="anom__sent">&ldquo;{r.textSent}&rdquo;</span>}
    </div>
  )

  return (
    <div className="learned">
      <span className="eyebrow">What went wrong</span>
      <div className="anom-lead">
        {shown.map((r) => (
          <Row key={r.id} r={r} />
        ))}
        {hidden.length > 0 && (
          <AnomalyMore count={hidden.length} critical={hiddenCritical}>
            <div className="anom-lead">
              {hidden.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </div>
          </AnomalyMore>
        )}
      </div>
    </div>
  )
}
