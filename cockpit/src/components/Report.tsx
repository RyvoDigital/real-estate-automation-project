'use client'

import { useState } from 'react'
import type { WeeklyReport } from '@/lib/data'

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })

/**
 * The plain-text version, for copying into an email.
 *
 * There is deliberately NO send path. Sending client-facing mail is a new
 * delivery surface with its own template and its own failure modes, the
 * first reports want hand-editing, and §5.7 already requires an explicit
 * human action because a wrong number is worse than a late report. Copy is
 * the explicit human action, and it costs nothing to keep.
 */
function asText(r: WeeklyReport): string {
  const lines = [
    `${r.clientName} — week of ${fmtDate(r.start)}`,
    `${fmtDate(r.start)} to ${fmtDate(r.end)}`,
    '',
    `New leads:          ${r.totals.leadsNew}`,
    `Qualified:          ${r.totals.leadsQualified}`,
    `Viewings booked:    ${r.totals.viewingsBooked}`,
    `Messages sent:      ${r.totals.messagesSent}`,
    `Handed to a human:  ${r.totals.escalations}`,
  ]
  if (r.totals.leadsNew === 0 && r.totals.messagesSent === 0) {
    lines.push('', 'No enquiries reached the assistant this week.')
  }
  if (r.missingDays.length) {
    lines.push(
      '',
      `NOT FOR THE CLIENT — ${r.missingDays.length} day(s) have no derived row ` +
        `(${r.missingDays.join(', ')}), so these totals are incomplete.`,
    )
  }
  return lines.join('\n')
}

export function Report({ report }: { report: WeeklyReport }) {
  const [copied, setCopied] = useState(false)
  const r = report

  const max = Math.max(1, ...r.days.map((d) => d.row?.messagesSent ?? 0))
  const inProgress = r.days.some((d) => d.state === 'future')
  const nothing =
    r.totals.leadsNew === 0 &&
    r.totals.leadsQualified === 0 &&
    r.totals.viewingsBooked === 0 &&
    r.totals.messagesSent === 0 &&
    r.totals.escalations === 0

  const stat = (label: string, value: number) => (
    <div className="rstat" key={label}>
      <span className="rstat__label">{label}</span>
      {/* An explicit zero, never a dash and never an empty state. The client
          has to be able to tell "nothing happened" from "we did not look". */}
      <span className="rstat__value">{value}</span>
    </div>
  )

  return (
    <div className="report">
      {r.missingDays.length > 0 && (
        <div className="notice notice--bad">
          <span>
          {r.missingDays.length} of 7 days have no row in <code>metrics_daily</code> (
          {r.missingDays.join(', ')}). The nightly derivation did not run for those days, so
          these totals are incomplete — do not send this until it has.
          </span>
        </div>
      )}

      <div className="rsheet">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow">Weekly summary</span>
          <h2>{r.clientName}</h2>
          <span className="rsheet__dates">
            {fmtDate(r.start)} — {fmtDate(r.end)}
          </span>
        </div>

        <div className="rstats">
          {stat('New leads', r.totals.leadsNew)}
          {stat('Qualified', r.totals.leadsQualified)}
          {stat('Viewings booked', r.totals.viewingsBooked)}
          {stat('Messages sent', r.totals.messagesSent)}
          {stat('Handed to a human', r.totals.escalations)}
        </div>

        {nothing && r.missingDays.length === 0 && !inProgress && (
          <p className="rnothing">
            No enquiries reached the assistant this week. All seven days were measured and every
            count was zero — that is a quiet week, not a gap in the reporting.
          </p>
        )}
        {inProgress && (
          <p className="rnothing">
            This week is still running. {r.derivedDays} of 7 days have been derived; the rest have
            not happened yet. Report on a complete week before sending anything.
          </p>
        )}

        <div className="rweek">
          {r.days.map((d) => {
            const label = new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', {
              weekday: 'short', timeZone: 'UTC',
            })
            if (d.state === 'future') {
              return (
                <div className="rday rday--future" key={d.date} title={`${d.date}: not yet`}>
                  <span className="rday__track" />
                  <span className="rday__label">{label}</span>
                  <span className="rday__n">·</span>
                </div>
              )
            }
            if (!d.row) {
              return (
                <div className="rday rday--missing" key={d.date} title={`${d.date}: not derived`}>
                  <span className="rday__bar rday__bar--missing" />
                  <span className="rday__label">{label}</span>
                  <span className="rday__n">?</span>
                </div>
              )
            }
            const h = Math.round((d.row.messagesSent / max) * 100)
            return (
              <div className="rday" key={d.date} title={`${d.date}: ${d.row.messagesSent} messages`}>
                <span className="rday__track">
                  <span className="rday__bar" style={{ height: `${Math.max(h, 2)}%` }} />
                </span>
                <span className="rday__label">{label}</span>
                <span className="rday__n">{d.row.messagesSent}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="ractions">
        <button
          className="btn btn--primary"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(asText(r))
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'Copied' : 'Copy as text'}
        </button>
        <span className="ractions__note">
          Nothing is sent from here. Read the numbers, copy them, and send it yourself — §5.7,
          because a wrong number in a client-facing artefact is worse than a late report.
        </span>
      </div>

      <details className="rraw">
        <summary>The text that gets copied</summary>
        <pre>{asText(r)}</pre>
      </details>
    </div>
  )
}
