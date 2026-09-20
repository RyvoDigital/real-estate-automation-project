import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readReviewScreen } from '@/lib/review/screen-read'
import { explainTheGap } from '@/lib/review/reconcile-asks'
import { whyEmpty } from '@/lib/why-empty'
import { StateMark, StateSurface } from '@/components/state-chip'
import styles from './review.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REVIEW RECONCILIATION — Q22: did we ask everyone who closed?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief II §3.10.
 *
 * 🔴 CONTESTED BY DESIGN. The ask list is ALWAYS shorter than the sales list,
 * because "everyone" means everyone we may lawfully message — the gate refuses
 * segment D, segment E, suppressions and unresolvable jurisdictions. Somebody
 * will read that as a bug. **Closing it is the offence.**
 *
 * So the three counts sit side by side with the gap explained beside them: a
 * discrepancy that is displayed and explained does not get investigated as a
 * defect.
 *
 * 🔴 CAN DO: READ. Specifically no per-sale skip — "a skip button would be the
 * offence with an audit trail showing who committed it."
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Review({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let s: Awaited<ReturnType<typeof readReviewScreen>> | null = null
  let threw = ''
  try {
    s = await readReviewScreen(clientId)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  if (!s) {
    return (
      <>
        <h1 className={styles.title}>Did we ask everyone who closed?</h1>
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'the closes and the asks', threw }).sentence}
        </StateSurface>
      </>
    )
  }

  const gap = s.report.checked ? explainTheGap(s.report) : null

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Did we ask everyone who closed?</h1>
          <p className={styles.sub}>
            {client.name} · <b>the ask list is always shorter than the sales list</b>, and that is the gate working
            rather than a gap to close.
          </p>
        </div>
      </header>

      {!s.report.checked ? (
        /*
         * 🔴 S3, and already the state today. "The reconciliation did not run"
         * and "the reconciliation found nothing" are opposite claims that would
         * otherwise render as the same empty page.
         */
        <StateSurface meaning="grey" className={styles.empty}>
          <b>This reconciliation has not run.</b> {s.report.why} That is not a clean result — it is the absence of
          one, and the difference matters because a clean result here is what somebody would rely on.
        </StateSurface>
      ) : gap!.closes === 0 ? (
        <StateSurface meaning="grey" className={styles.empty}>
          {whyEmpty({ state: 'never', owner: 'this agency', thing: 'a close reported to us' }).sentence} There is
          nothing to reconcile: no sale has been reported, so no ask was owed.
        </StateSurface>
      ) : (
        <>
          {/* 🔒 THE THREE COUNTS SIDE BY SIDE. Not a headline with footnotes:
              the difference between them is the whole subject, and hiding two
              of the three is how the difference becomes a surprise. */}
          <section className={styles.three}>
            <div className={styles.count}>
              <span className={styles.n}>{gap!.closes}</span>
              <span className={styles.l}>closed</span>
            </div>
            <span className={styles.op}>−</span>
            <div className={styles.count}>
              <span className={styles.n}>{gap!.asked}</span>
              <span className={styles.l}>asked for a review</span>
            </div>
            <span className={styles.op}>=</span>
            <div className={styles.count}>
              <span className={styles.n}>{gap!.difference}</span>
              <span className={styles.l}>not asked</span>
            </div>
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2>Why each one was not asked</h2>
              <span className={styles.answers}>
                {/* 🔒 Seven reasons, none able to express a judgement. */}
                every reason is a fact about the record, never an opinion about the sale
              </span>
            </header>
            <div className={styles.rows}>
              {gap!.lines.map((line) => (
                <div className={styles.row} key={line.reason}>
                  <StateMark meaning="held" label="not asked" />
                  <span className={styles.rowBody}>
                    <span className={styles.means}>{line.means}</span>
                    <span className={styles.code}>{line.reason}</span>
                  </span>
                  <span className={styles.rowN}>{line.count}</span>
                </div>
              ))}
              {s.report.pending > 0 && (
                <div className={styles.row}>
                  <StateMark meaning="clock" label="pending" />
                  <span className={styles.rowBody}>
                    <span className={styles.means}>Still inside their window — not yet owed, and not a miss.</span>
                  </span>
                  <span className={styles.rowN}>{s.report.pending}</span>
                </div>
              )}
            </div>
          </section>

          {/* 🔴 THE FINDING, AND IT MUST ALWAYS BE EMPTY. An unaccounted close
              is the only output of this screen that means anything: two hundred
              historical closes reporting as findings would hide the one genuine
              skip. */}
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2>Unexplained</h2>
              <span className={styles.answers}>the only output here that is a finding</span>
            </header>
            {gap!.unexplained === 0 ? (
              <StateSurface meaning="through" className={styles.empty}>
                Every close that was not asked has a named reason. Nothing is unexplained — which is what this screen
                is for, and is a statement about our own records rather than about the agency&rsquo;s sales.
              </StateSurface>
            ) : (
              <StateSurface meaning="red" className={styles.empty}>
                <b>
                  {gap!.unexplained} close{gap!.unexplained === 1 ? '' : 's'} went unasked with no reason recorded.
                </b>{' '}
                This is the genuine skip. It is not explained by a window, a refusal or a gate — something did not
                happen that should have.
              </StateSurface>
            )}
          </section>

          {/* 🔒 WHAT THE RUN COULD NOT SEE — on the screen, never in a footnote.
              A clean report is a statement about our own rows. */}
          {s.report.limits.length > 0 && (
            <section className={styles.panel}>
              <header className={styles.panelHead}>
                <h2>What this check cannot see</h2>
                <span className={styles.answers}>permanent limits, which makes them easier to forget</span>
              </header>
              <ul className={styles.limits}>
                {s.report.limits.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          <b>Nothing. It reads.</b> In particular there is no per-sale skip — a skip button would be the offence with
          an audit trail showing who committed it.
        </p>
        <p>
          It does not ask anybody late. A reconciliation that could act would be tempted, on finding somebody
          unasked, to ask them six weeks afterwards — outside every window, into a quality rating it cannot see.
        </p>
        <p>
          It does not close the gap between closes and asks. That gap is the gate refusing people we may not lawfully
          message, and closing it is the offence rather than the fix.
        </p>
      </div>
    </>
  )
}
