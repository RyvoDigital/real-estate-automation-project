import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readForecast, BASIS_SPLIT_UNAVAILABLE } from '@/lib/forecast/read'
import { whyEmpty } from '@/lib/why-empty'
import { StateMark, StateSurface } from '@/components/state-chip'
import styles from './campaign.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FORECAST — Q16: who would it reach, who would it refuse, and why?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §4.
 *
 * 🔒 THE REFUSAL BREAKDOWN IS THE SCREEN. A campaign of 300 that refuses 280 is
 * the normal case and the 280 is the part with work in it, so it is the body of
 * the page rather than a footnote under a headline. **The screen does not
 * apologise for its own output.**
 *
 * 🔴 AND IT MUST NOT READ AS A STATEMENT ABOUT THE PRESENT (§4.1). Opened a
 * month later it would say "41 refused — Portugal is not confirmed by a lawyer"
 * about a Portugal confirmed three weeks ago. Everything true about the
 * evaluation date, false about today, and nothing in the layout saying which.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function ageOf(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export default async function Forecast({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const f = await readForecast(clientId)

  if (f === null) {
    return (
      <>
        <h1 className={styles.title}>The forecast</h1>
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'the campaign runs', threw: 'the read did not return' }).sentence}
        </StateSurface>
      </>
    )
  }

  if (f === 'never') {
    // S2, and today's state for every client.
    return (
      <>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>The forecast</h1>
            <p className={styles.sub}>
              {client.name} · if we ran the campaign now, who would it reach and who would it refuse
            </p>
          </div>
        </header>
        <StateSurface meaning="grey" className={styles.empty}>
          {whyEmpty({ state: 'never', owner: 'this client', thing: 'a campaign evaluation' }).sentence} Nothing has
          been forecast, so there is no breakdown to show — and no campaign has been run, so nobody has been written
          to.
        </StateSurface>
        <Absences />
      </>
    )
  }

  const worst = f.refusals[0]

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>The forecast</h1>
          <p className={styles.sub}>
            {client.name} · {f.automation} · <b>mostly refusals is the product working</b>, not a fault in the list
          </p>
        </div>
        {/* 🔒 §4.1 rule 1: the timestamp is in the header WITH AN AGE. "26 days
            ago" is read; a date is skimmed. */}
        <span className={styles.stamp}>
          <span>Evaluated</span>
          <b>{f.evaluatedAt ? ageOf(f.evaluatedAt) : 'not yet'}</b>
          <span>{f.evaluatedAt ? new Date(f.evaluatedAt).toLocaleString('en-GB', { dateStyle: 'medium' }) : ''}</span>
        </span>
      </header>

      {/* 🔴 §4.1 rules 2 and 3: a run older than its inputs says so, names which
          reason is stale, and offers re-evaluation FROM HERE rather than buried
          with the other actions. */}
      {f.anyStale && (
        <StateSurface meaning="clock" className={styles.staleBanner}>
          <b>This forecast is older than something it depended on.</b> The most common reason a campaign refused is a
          thing that has since been fixed — the campaign is not wrong, it is early.
          <span className={styles.staleWhich}>
            {f.refusals
              .filter((r) => r.staleness.state === 'cause_gone' || r.staleness.state === 'moved')
              .map((r) => `${r.count}× ${r.means}`)
              .join(' · ')}
          </span>
          <span className={styles.reevaluate}>Re-evaluating is the only way to know — this page never recomputes it.</span>
        </StateSurface>
      )}

      {f.status === 'halted' && (
        <StateSurface meaning="red" className={styles.staleBanner}>
          {/* A CHECK constraint enforces that a halted run states its reason. */}
          <b>This run halted.</b> {f.haltedReason}
        </StateSurface>
      )}

      <section className={styles.counts}>
        <div className={styles.count}>
          <span className={styles.countN}>{f.targetCount}</span>
          <span className={styles.countL}>in the list</span>
        </div>
        <div className={styles.count}>
          <span className={styles.countN}>{f.forecastPermitted}</span>
          <span className={styles.countL}>would be written to</span>
        </div>
        <div className={styles.count}>
          <span className={styles.countN}>{f.forecastRefused}</span>
          <span className={styles.countL}>refused by the gate</span>
        </div>
        <div className={styles.count}>
          <span className={styles.countN}>{f.excludedCount}</span>
          <span className={styles.countL}>never asked — terminal</span>
        </div>
      </section>

      {/* ── the body of the screen ─────────────────────────────────────────── */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>Why each one was refused</h2>
          <span className={styles.answers}>largest first — the biggest group is the one with work in it</span>
        </header>

        {f.refusals.length === 0 ? (
          <StateSurface meaning="grey" className={styles.empty}>
            Nothing was refused in this evaluation.
          </StateSurface>
        ) : (
          <div className={styles.rows}>
            {f.refusals.map((r) => {
              const stale = r.staleness.state === 'cause_gone' || r.staleness.state === 'moved'
              return (
                <div className={styles.row} key={r.reason}>
                  <StateMark meaning={stale ? 'clock' : 'held'} label={stale ? 'may be stale' : 'refused'} />
                  <span className={styles.rowBody}>
                    {/* 🔒 The operator sentence, from GATE_REFUSAL_MEANS — the
                        gate's own words, not a second wording written here. */}
                    <span className={styles.means}>{r.means}</span>
                    <span className={styles.code}>{r.reason}</span>
                    {stale && (
                      <span className={styles.rowStale}>
                        {r.staleness.state === 'cause_gone'
                          ? 'The reason given here has since been resolved — this group would not refuse today.'
                          : 'Something this depended on has changed since. We are not saying what today’s answer would be.'}
                      </span>
                    )}
                    {r.reason === BASIS_SPLIT_UNAVAILABLE.reason && (
                      /*
                       * 🔴 The split the brief requires and the recorded data
                       * cannot express. Said, not guessed.
                       */
                      <span className={styles.gap}>
                        <b>This group is two different things and the forecast cannot tell them apart.</b>{' '}
                        {BASIS_SPLIT_UNAVAILABLE.whyItMatters} {BASIS_SPLIT_UNAVAILABLE.why}
                        <span className={styles.gapFix}>{BASIS_SPLIT_UNAVAILABLE.whatWouldFix}</span>
                      </span>
                    )}
                  </span>
                  <span className={styles.n}>{r.count}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {Object.keys(f.excludedBreakdown).length > 0 && (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>Never asked at all</h2>
            <span className={styles.answers}>terminal — the gate is not consulted, and a later run will not ask either</span>
          </header>
          <div className={styles.rows}>
            {Object.entries(f.excludedBreakdown).map(([k, v]) => (
              <div className={styles.row} key={k}>
                <StateMark meaning="grey" label="excluded" />
                <span className={styles.rowBody}>
                  <span className={styles.code}>{k}</span>
                </span>
                <span className={styles.n}>{v}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Absences />
    </>
  )
}

function Absences() {
  return (
    <div className={styles.absent}>
      <h2>What this page does not do</h2>
      <p>
        <b>The forecast authorises nothing.</b> The gate decides again before every send, and a contact permitted here
        may be refused there. That is the design working — and it is also the only moment the system learns its
        forecast was wrong, which is why late refusals past a threshold halt the run.
      </p>
      <p>
        It does not re-evaluate by being opened, and it never recomputes a refusal in place. What is shown is what was
        decided, at the moment it says.
      </p>
      <p>
        <b>The first send is staged and the staging is not advice:</b> ten contacts — not a tranche, not 10% — watched
        live message by message, stopped on the first thing that <i>surprises</i> anybody rather than the first error,
        with the full forecast recorded first so the ten are visibly a subset, and a named person accountable before
        it starts.
      </p>
      <p>
        <b>There is no rehearsal and no control here can create one.</b> Every route to one involves writing a
        lawyer&rsquo;s confirmation that did not happen into the one table built to be trustworthy. A system that
        would let us fake a confirmation in order to test itself is a system whose confirmations mean nothing.
      </p>
      <p>No editing a refusal, no re-sending a refused contact, and nothing across clients.</p>
    </div>
  )
}
