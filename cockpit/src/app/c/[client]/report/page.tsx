import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients, lastCompleteWeekStart } from '@/lib/data'
import { readWeek } from '@/lib/report/week-read'
import { renderWeekly } from '@/lib/report/attribution'
import { whyEmpty } from '@/lib/why-empty'
import { CopyAsText } from '@/components/report/CopyAsText'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './report.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WEEKLY REPORT — Q26: what do I send this client on Monday?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §11.
 *
 * 🔒 ITS OUTPUT IS A DOCUMENT, NOT A PAGE. The client never logs in. This is
 * the preview and the generator; the artefact is what gets sent — so it is
 * rendered AS the artefact, monospaced, in `renderWeekly`'s own lines and
 * spacing, because THE INDENTATION IS THE LOGIC.
 *
 * 🔴 OVERLAPPING CATEGORIES ARE NEVER SUMMED. A reactivated contact who becomes
 * a qualified lead is genuinely both. "41 conversations + 12 reactivations = 53
 * contacts" is false, and THE LIE ENTERS AT THE SUM — so reactivations are a
 * subset line indented under the figure they are part of, never a parallel one,
 * and there is no total line anywhere.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function WeeklyReport({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>
  searchParams: Promise<{ week?: string }>
}) {
  await requireOperator()
  const [{ client: clientId }, { week }] = await Promise.all([params, searchParams])
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const weekStart = week ?? lastCompleteWeekStart()
  const v = await readWeek(clientId, weekStart)

  if (!v) {
    return (
      <>
        <h1 className={styles.title}>The weekly report</h1>
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'the week', threw: 'the read did not return' }).sentence}
        </StateSurface>
      </>
    )
  }

  const { report, figures, withheldBecause, cannotDerive } = v
  const held = withheldBecause.length > 0 || cannotDerive !== null

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>The weekly report</h1>
          <p className={styles.sub}>
            {client.name} · the week of {report.start} to {report.end}. <b>This page is the preview</b> — what the
            agency receives is the document below, and they never see this screen.
          </p>
        </div>
      </header>

      {/* 🔒 THE WEEK STRIP: three day-states in one line. Collapsing the last
          two is what painted a normal week as a failure in the first version —
          a day that has not happened yet is not a day the derivation missed. */}
      <section className={styles.strip} aria-label="Each day of the week, and whether it was derived">
        {report.days.map((d) => (
          <span
            className={`${styles.day} ${
              d.state === 'derived' ? styles.derived : d.state === 'missing' ? styles.missing : styles.future
            }`}
            key={d.date}
          >
            <span className={styles.dayName}>
              {new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' })}
            </span>
            {/* The colour comes from the component that owns the state, never
                from this screen's stylesheet. */}
            <StateChip meaning={d.state === 'missing' ? 'red' : 'grey'}>
              {d.state === 'derived' ? 'derived' : d.state === 'missing' ? 'no row' : 'not yet'}
            </StateChip>
          </span>
        ))}
      </section>

      {withheldBecause.length > 0 && (
        /*
         * 🔴 EVERY FIGURE IS WITHHELD, not a six-day total and not zeros for
         * the gap. The nightly derivation did not run, so any figure covering
         * this week is incomplete — and an incomplete figure presented as a
         * figure is §5j inside a document somebody is paying for.
         */
        <StateSurface meaning="red" className={styles.banner}>
          <b>No figures for this week.</b> The nightly derivation did not run on{' '}
          {withheldBecause
            .map((d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long' }))
            .join(' and ')}
          , so every number covering it would be short by a day and look complete. They are withheld rather than
          summed over six days, and the gap cannot be filled from this page.
          <span className={styles.alternative}>
            The one honest alternative is to send the days we do have, labelled as {report.derivedDays} days rather
            than as a week.
          </span>
        </StateSurface>
      )}

      {cannotDerive && (
        <StateSurface meaning="red" className={styles.banner}>
          <b>One figure cannot be derived, so the document is held.</b> {cannotDerive.figure} — {cannotDerive.why}
          <span className={styles.alternative}>
            A zero would be the tempting answer and the worst one: it would understate the automation this report
            exists to show. {cannotDerive.whatWouldFix}
          </span>
        </StateSurface>
      )}

      {held ? (
        /*
         * 🔴 AND THERE IS NO SEND CONTROL ON THIS WEEK — not a greyed one. A
         * report that cannot honestly be sent must not look one click from
         * going. §0.4-7, and the design records that a disabled button still
         * read as pressable in the first render.
         */
        <StateSurface meaning="held" className={styles.banner}>
          <b>Sending is held.</b> There is no control here, rather than a greyed one — a document that cannot
          honestly be sent should not look one click from going.
        </StateSurface>
      ) : (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>What the agency receives</h2>
            <span className={styles.answers}>
              rendered as the document, because the indentation is the logic rather than a layout
            </span>
          </header>
          {/* 🔒 renderWeekly's own lines and spacing. A second formatter here
              would drift from what is actually sent. */}
          <pre className={styles.artefact}>{renderWeekly(figures!)}</pre>
          {/* 🔒 The copy, never the send (§5.7), and only here: a held week has
              no control at all, which is the branch above. It hands over the
              SAME string this <pre> shows, so nothing can drift from it. */}
          <CopyAsText text={renderWeekly(figures!)} />
          {report.days.every((d) => d.state === 'derived') &&
            figures!.conversations === 0 &&
            figures!.meetings === 0 && (
              // 🔴 S1 IS A LEGITIMATE REPORT and must not look like a broken one.
              <p className={styles.quiet}>
                Nothing came in this week. All seven days were derived, so the zeros mean nothing happened rather than
                something failing — which is a report, not the absence of one.
              </p>
            )}
        </section>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          It never adds the indented lines to the ones above them. A contact who came from the old list and became a
          live enquiry is genuinely both, and choosing one box understates one automation and overstates the other.
          There is no total anywhere in the document.
        </p>
        <p>
          It never fills a day the derivation missed, and never presents a figure covering a week it could not see in
          full.
        </p>
        <p>No figure is edited here, and no sentence is added that asserts something the data does not carry.</p>
        <p>
          What the assistant books is an introductory meeting between the contact and one of the agency&rsquo;s
          people. The document says that, whatever the underlying column is called.
        </p>
      </div>
    </>
  )
}
