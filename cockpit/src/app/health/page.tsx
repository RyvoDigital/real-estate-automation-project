import { requireOperator } from '@/lib/auth'
import { HEALTH_STALE_MINUTES, getHealth, getQueue } from '@/lib/data'
import { Shell } from '@/components/Shell'
import { IconWarning } from '@/components/Icons'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function HealthPage() {
  const operator = await requireOperator()
  const [run, queue] = await Promise.all([getHealth(), getQueue()])

  // Computed at render, and the ABSOLUTE time is printed beside it. A
  // relative time on a page left open overnight says "5 minutes ago" for
  // twelve hours, which is the same failure as everything else in the log:
  // something reassuring that is no longer true.
  const renderedAt = new Date()
  const ageMin = run ? Math.floor((renderedAt.getTime() - Date.parse(run.ranAt)) / 60_000) : null
  const stale = ageMin === null || ageMin >= HEALTH_STALE_MINUTES

  const abs = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Europe/Lisbon',
    })

  const total = run ? run.passed.length + run.failed.length : 0

  return (
    <Shell active="more" openCount={queue.length} email={operator.email}>
      <header className="head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">Twelve checks</span>
          <h1 className="head__title">Health</h1>
        </div>
      </header>
      <span className="head__sub">The value here is seeing green. Red is already an email.</span>

      {/* The last-run stamp is the most important thing on this screen, so it
          is the biggest thing on it — §5.6. A stale health screen is worse
          than none, because it looks reassuring while telling you nothing. */}
      <div className={`hstamp${stale ? ' hstamp--stale' : ''}`}>
        <div className="hstamp__main">
          <span className="eyebrow">Last run</span>
          {run ? (
            <>
              <span className="hstamp__abs">{abs(run.ranAt)}</span>
              <span className="hstamp__rel">
                {ageMin === 0 ? 'less than a minute ago' : `${ageMin} minute${ageMin === 1 ? '' : 's'} ago`}
                {run.durationMs !== null ? ` · took ${(run.durationMs / 1000).toFixed(1)}s` : ''}
                {run.host ? ` · ${run.host}` : ''}
              </span>
            </>
          ) : (
            <span className="hstamp__abs">Never</span>
          )}
        </div>
        <div className="hstamp__side">
          <span className="hstamp__at">
            This page rendered {abs(renderedAt.toISOString())}
          </span>
          {stale && (
            <span className="hstamp__warn">
              <IconWarning size={14} />
              <span>{run
                ? `No result for ${ageMin} minutes. The check runs every 10, so this screen is not telling you the system is fine — it is telling you nothing.`
                : 'The check has never published. This screen has no data at all.'}</span>
            </span>
          )}
        </div>
      </div>

      {run && (
        <>
          <div className="hsummary">
            <span className={`hbadge${run.ok ? ' hbadge--ok' : ' hbadge--bad'}`}>
              {run.failed.length === 0 ? `${run.passed.length} of ${total} passing` : `${run.failed.length} failing`}
            </span>
            <div className="hbar">
              {run.passed.map((_, i) => <span key={`p${i}`} className="hbar__seg hbar__seg--ok" />)}
              {run.failed.map((_, i) => <span key={`f${i}`} className="hbar__seg hbar__seg--bad" />)}
            </div>
          </div>

          <div className="hchecks">
            {run.failed.map((c, i) => (
              <div key={`f${i}`} className="hcheck hcheck--bad">
                <span className="hcheck__dot" />
                <span className="hcheck__text">{c}</span>
                <span className="hcheck__tag">Failing</span>
              </div>
            ))}
            {run.passed.map((c, i) => (
              <div key={`p${i}`} className="hcheck">
                <span className="hcheck__dot" />
                <span className="hcheck__text">{c}</span>
              </div>
            ))}
          </div>

          <p className="hnote">
            One of these checks is &ldquo;Supabase reachable&rdquo;, and this screen is served
            from Supabase. So a Supabase outage cannot appear here as a red row — it appears as
            the last-run time above going stale. Email is the channel that does not depend on
            what it watches.
          </p>
        </>
      )}
    </Shell>
  )
}
