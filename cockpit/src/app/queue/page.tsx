import { requireOperator } from '@/lib/auth'
import { ANOMALY_WINDOW_DAYS, getAnomalies, getQueue } from '@/lib/data'
import { detectOutage, formatWait } from '@/lib/escalation'
import { Shell } from '@/components/Shell'
import { AnomalyList } from '@/components/Anomalies'
import { OutageBanner, PressureBar, QueueHero, QueueRowItem } from '@/components/Queue'

// Never cached. A queue screen that is even a minute stale is worse than no
// queue screen, because it looks current. Same reasoning as the health
// screen's last-run stamp in §5.6.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function QueuePage() {
  const operator = await requireOperator()
  // Independent reads, so they go in parallel: the anomaly feed must never
  // slow down the screen whose whole job is being current.
  const [rows, anomalies] = await Promise.all([getQueue(), getAnomalies()])

  const outage = detectOutage(rows.map((r) => ({ at: r.at, reasons: r.reasons })))
  const [oldest, ...behind] = rows

  return (
    <Shell active="queue" openCount={rows.length} email={operator.email}>
      <header className="head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">Waiting on you</span>
          <h1 className="head__title">Escalations</h1>
        </div>
      </header>

      {outage.active && outage.reason && (
        <OutageBanner count={outage.count} reason={outage.reason} />
      )}

      {/* The sort order is stated whether or not anything is waiting. It is a
          property of the screen, not of the data on it — and probe-e2e checks
          for it, correctly, on an empty queue too. */}
      <span className="head__sub">
        All clients &middot; longest waiting first
        {oldest ? ` · oldest ${formatWait(oldest.minutes)}` : ''}
      </span>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>Nobody is waiting</h2>
          <p>
            No lead currently has <code>qualification.escalated</code> set. This is the resting
            state, and it is the one you want.
          </p>
        </div>
      ) : (
        <>
          <QueueHero row={oldest} />

          <PressureBar rows={rows} />

          {behind.length > 0 && (
            <>
              <div className="section">
                <span className="eyebrow">Behind it</span>
                <hr />
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                  {behind.length}
                </span>
              </div>
              <div className="rows">
                {behind.map((row) => (
                  <QueueRowItem key={row.id} row={row} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* §4.8: what the system got WRONG, as opposed to what is waiting for a
          human. Below the queue because a lead waiting now outranks a fault
          that already happened — and on the same screen because the morning
          question is both at once. */}
      <AnomalyList
        groups={anomalies.groups}
        total={anomalies.total}
        capped={anomalies.capped}
        leadNames={anomalies.leadNames}
        windowDays={ANOMALY_WINDOW_DAYS}
      />
    </Shell>
  )
}
