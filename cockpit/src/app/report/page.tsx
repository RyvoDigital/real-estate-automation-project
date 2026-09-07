import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients, getQueue, getWeeklyReport, lastCompleteWeekStart, mondayOf } from '@/lib/data'
import { Shell, Who } from '@/components/Shell'
import { Report } from '@/components/Report'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ISO = /^\d{4}-\d{2}-\d{2}$/

function shift(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; week?: string }>
}) {
  const operator = await requireOperator()
  const sp = await searchParams
  const [clients, queue] = await Promise.all([getClients(), getQueue()])

  if (clients.length === 0) {
    return (
      <Shell active="report" openCount={queue.length}>
        <div className="topbar">
          <div style={{ flexGrow: 1 }}>
            <h1 className="topbar__title">Weekly report</h1>
          </div>
          <Who email={operator.email} />
        </div>
        <div className="empty">
          <h2>No clients yet</h2>
          <p>Onboard one first — there is nothing to report on.</p>
        </div>
      </Shell>
    )
  }

  const clientId = clients.find((c) => c.id === sp.client)?.id ?? clients[0].id
  // Anything unparseable falls back to the last complete week rather than
  // throwing: a hand-typed URL is not an error condition.
  const week =
    sp.week && ISO.test(sp.week) ? mondayOf(new Date(`${sp.week}T00:00:00Z`)) : lastCompleteWeekStart()

  const report = await getWeeklyReport(clientId, week)
  const href = (c: string, w: string) => `/report?client=${c}&week=${w}`

  return (
    <Shell active="report" openCount={queue.length}>
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1 }}>
          <h1 className="topbar__title">Weekly report</h1>
          <span className="topbar__sub">
            Every figure comes from <code>metrics_daily</code>. Nothing is counted here.
          </span>
        </div>
        <Who email={operator.email} />
      </div>

      <div className="filters__rows">
        {clients.length > 1 && (
          <div className="chips">
            <span className="chips__label">Client</span>
            {clients.map((c) => (
              <Link
                key={c.id}
                className={`fchip${c.id === clientId ? ' fchip--on' : ''}`}
                href={href(c.id, week)}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
        <div className="chips">
          <span className="chips__label">Week</span>
          <Link className="fchip" href={href(clientId, shift(week, -1))}>
            ← Earlier
          </Link>
          <Link className="fchip fchip--on" href={href(clientId, week)}>
            {week}
          </Link>
          <Link className="fchip" href={href(clientId, shift(week, 1))}>
            Later →
          </Link>
          <Link className="fchip" href={href(clientId, lastCompleteWeekStart())}>
            Last complete week
          </Link>
        </div>
      </div>

      <Report report={report} />

      <p className="hnote">
        <strong>Handed to a human</strong> is derived by <code>metrics_daily.py</code> from
        <code>lead.escalated</code>, not counted here — §9. Escalations that were later handled
        are not subtracted: one that happened still happened, and a number that falls when you do
        your job is a number nobody can reason about.{' '}
        <strong>Reactivations</strong> stays absent rather than showing zero, because nothing
        produces them until that automation exists and a standing zero implies we tried.
      </p>
    </Shell>
  )
}
