import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getAnomaliesForClient, getClients, ANOMALY_WINDOW_DAYS } from '@/lib/data'
import { anomalyClock, splitAnomalies, type AnomalyGroup } from '@/lib/anomaly'
import { whyEmpty } from '@/lib/why-empty'
import { StateMark, StateSurface } from '@/components/state-chip'
import styles from './anomalies.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WENT WRONG HERE — Q12, for one client.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §3. 🔴 **Evidence before it is a worklist** — this is the record an
 * agent needs when a lead complains about something the system got wrong, which
 * is why `summary` is never re-worded, `textSent` is shown as stored, and
 * nothing is dismissible.
 *
 * 🔒 THE FOUR CONSTRAINTS ARE TRANSPLANTED, NOT REDESIGNED (§4.8), and they
 * live in `lib/anomaly.ts` rather than here: `groupAnomalies` collapses by
 * kind, `splitAnomalies` holds the four-visible rule and reports the severity
 * of what it hides. This page renders them in the client frame's direction and
 * re-implements none of them — a second grouping rule would drift from the
 * operator screen's and the two would disagree about the same events.
 *
 * 🔴 AND THE ORDER IS NEVER RE-SORTED TO FLOAT CRITICALS. That would put a
 * six-day-old critical above a two-minute-old warning and destroy the list as a
 * timeline. Vertical space and burying are separate concerns: the expander
 * states the severity of what it hides, and that is the whole anti-burying
 * mechanism.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function Group({ g, leadNames, clientId }: { g: AnomalyGroup; leadNames: Map<string, string>; clientId: string }) {
  const r = g.latest
  return (
    <div className={styles.row}>
      {/* Severity is a MARK, not a position. The list stays in time order. */}
      <StateMark meaning={r.severity === 'critical' ? 'red' : 'clock'} label={r.severity} />
      <div className={styles.body}>
        <div className={styles.top}>
          <span className={styles.label}>{r.label}</span>
          {r.stage && <span className={styles.stage}>{r.stage.replace('_', ' ')}</span>}
          {r.invariant && <span className={styles.stage}>invariant {r.invariant}</span>}
        </div>

        {/* 🔒 The event's own sentence, unedited. A second formatter in the
            cockpit would drift from the one the WhatsApp carried. */}
        <p className={styles.summary}>{r.summary}</p>

        {r.textSent && (
          <p className={styles.sent}>
            <span className={styles.sentLabel}>what the lead was sent, as stored</span>
            <span className={styles.stored}>{r.textSent}</span>
          </p>
        )}

        <div className={styles.foot}>
          {/* 🔒 The window is named ON THE COUNT. A bare "37×" is a claim about
              all time, and this is a count in a window. */}
          <span>
            {g.count}× since {anomalyClock(g.oldestAt)}, in the last {ANOMALY_WINDOW_DAYS} days
          </span>
          <span>· latest {anomalyClock(r.at)}</span>
          {r.leadId ? (
            <Link className={styles.open} href={`/leads/${r.leadId}`}>
              {leadNames.get(r.leadId) ?? 'open the lead'}
            </Link>
          ) : (
            // 🔒 Said, not rendered as an empty slot. A run that threw belongs
            // in the morning list whether or not it has a lead.
            <span className={styles.noLead}>no lead is attached to this one</span>
          )}
          {r.executionUrl && (
            <a className={styles.open} href={r.executionUrl} target="_blank" rel="noreferrer">
              the execution
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function ClientAnomalies({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let feed: Awaited<ReturnType<typeof getAnomaliesForClient>> | null = null
  let threw = ''
  try {
    feed = await getAnomaliesForClient(clientId)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  const split = feed ? splitAnomalies(feed.groups, (g) => g.latest.severity) : null

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>What went wrong</h1>
          <p className={styles.sub}>
            {client.name} · <b>the record an agent needs when a lead complains</b>. Nothing here is dismissed, and no
            sentence is re-worded.
          </p>
        </div>
        <span className={styles.stamp}>
          <span>Last</span>
          <b>{ANOMALY_WINDOW_DAYS} days</b>
          {/* S6: rendered as 500+ rather than silently under-counted. */}
          <span>{feed ? (feed.capped ? `${feed.total}+` : feed.total) : '—'} occurrences</span>
        </span>
      </header>

      {feed === null ? (
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'the anomaly log', threw }).sentence}
        </StateSurface>
      ) : feed.groups.length === 0 ? (
        // 🔒 S1 NAMES THE WINDOW. "No anomalies" over seven days and over one
        // hour are different claims.
        <StateSurface meaning="through" className={styles.empty}>
          {
            whyEmpty({
              state: 'resting',
              thing: 'anomalies',
              scope: `for ${client.name} in the last ${ANOMALY_WINDOW_DAYS} days`,
              welcome: true,
            }).sentence
          }{' '}
          Nothing has violated an invariant or thrown in that window. A longer window would be a different question,
          and this page does not answer it.
        </StateSurface>
      ) : (
        <>
          <div className={styles.rows}>
            {split!.shown.map((g) => (
              <Group g={g} leadNames={feed!.leadNames} clientId={clientId} key={g.latest.id} />
            ))}
          </div>

          {split!.hidden.length > 0 && (
            <details className={styles.more}>
              {/* 🔒 The expander STATES THE SEVERITY OF WHAT IT HIDES, so
                  collapsing cannot reintroduce the burying that grouping
                  exists to prevent. */}
              <summary>
                {split!.hidden.length} more fault{split!.hidden.length === 1 ? '' : 's'}
                {split!.hiddenCritical > 0 && <> · {split!.hiddenCritical} critical</>}
              </summary>
              <div className={styles.rows}>
                {split!.hidden.map((g) => (
                  <Group g={g} leadNames={feed!.leadNames} clientId={clientId} key={g.latest.id} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {feed !== null && feed.unattributed > 0 && (
        <p className={styles.unattributed}>
          {feed.unattributed} anomal{feed.unattributed === 1 ? 'y' : 'ies'} in this window name no client at all, so
          they cannot appear on a per-client page. They are on the operator&rsquo;s own list.
        </p>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          Nothing is dismissed or acknowledged. These are history — if a kind keeps firing after its cause is
          understood, that is a reason to change the check, not to hide the record.
        </p>
        <p>
          No summary is re-worded. The row shows the event&rsquo;s own sentence, the same one the alert carried; a
          second formatter here would drift from it and the two would disagree about the same event.
        </p>
        <p>
          Criticals are never floated to the top. That would put a six-day-old critical above a two-minute-old
          warning and destroy the list as a timeline.
        </p>
        <p>Nothing about any other client appears here.</p>
      </div>
    </>
  )
}
