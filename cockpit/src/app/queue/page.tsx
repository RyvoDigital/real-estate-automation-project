import { requireOperator } from '@/lib/auth'
import { getQueue } from '@/lib/data'
import { detectOutage, formatWait } from '@/lib/escalation'
import { Shell, Who } from '@/components/Shell'
import { OutageBanner, PressureBar, QueueCard } from '@/components/Queue'

// Never cached. A queue screen that is even a minute stale is worse than no
// queue screen, because it looks current. Same reasoning as the health
// screen's last-run stamp in §5.6.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function QueuePage() {
  const operator = await requireOperator()
  const rows = await getQueue()

  const outage = detectOutage(rows.map((r) => ({ at: r.at, reasons: r.reasons })))
  const oldest = rows[0]

  return (
    <Shell active="escalations" openCount={rows.length}>
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1 }}>
          <h1 className="topbar__title">Escalations</h1>
          <span className="topbar__sub">
            All clients &middot; longest waiting first
            {oldest ? ` · oldest ${formatWait(oldest.minutes)}` : ''}
          </span>
        </div>
        <Who email={operator.email} />
      </div>

      {outage.active && outage.reason && (
        <OutageBanner count={outage.count} reason={outage.reason} />
      )}

      {rows.length > 0 && <PressureBar rows={rows} />}

      {rows.length === 0 ? (
        <div className="empty">
          <h2>Nobody is waiting</h2>
          <p>
            No lead currently has <code>qualification.escalated</code> set. This is the resting
            state, and it is the one you want.
          </p>
        </div>
      ) : (
        <div className="stack">
          {rows.map((row) => (
            <QueueCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </Shell>
  )
}
