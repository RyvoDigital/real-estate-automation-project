import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients, getQueue, type QueueRow } from '@/lib/data'
import { readCounts, headline } from '@/lib/counts'
import { CLASS_LABEL, detectOutage, humanise, type EscalationClass } from '@/lib/escalation'
import { whyEmpty } from '@/lib/why-empty'
import { Live } from '@/components/Live'
import { Clock } from '@/components/Clock'
import { Stamp } from '@/components/Stamp'
import { StateChip, StateMark, StateSurface, type Meaning } from '@/components/state-chip'
import styles from './escalations.module.css'

/*
 * Q11 — is anybody at this client waiting for a human. Brief III §2.
 *
 * Never cached. A queue that is a minute stale is worse than no queue,
 * because it looks current — the same reasoning the old /queue carried, and
 * the reason the clocks freeze rather than keep counting when a re-read fails.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CLASS_MEANING: Record<EscalationClass, Meaning> = {
  // Something broke. Red is "broken, or past its limit".
  system: 'red',
  // A rule sent this to a person: the budget crossed the threshold somebody
  // set. A decision, not an error.
  high_value: 'held',
  // The lead asked. Also a rule holding the machine back, deliberately.
  person: 'held',
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Row({ row }: { row: QueueRow }) {
  return (
    <Link href={`/c/${row.clientId}/contacts/${row.id}`} className={styles.row}>
      <span className={styles.mark}>
        {initials(row.name)}
        {row.primary === 'system' && (
          <span className={styles.badge}>
            <StateMark meaning="red" label="something broke" />
          </span>
        )}
      </span>
      <span>
        <span className={styles.verb}>{humanise(row.reasons[0] ?? '')}</span>
        <span className={styles.who}>
          <span>{row.name}</span>
          {/* A lead with two reasons gets two chips. That is the visible form
              of the reasons[] rule: if the screen only ever showed one,
              nothing would tell you the second was dropped. */}
          {row.classes.map((c) => (
            <StateChip key={c} meaning={CLASS_MEANING[c]}>
              {CLASS_LABEL[c]}
            </StateChip>
          ))}
        </span>
      </span>
      <Clock at={row.at} serverMinutes={row.minutes} />
    </Link>
  )
}

export default async function EscalationsPage({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const readAt = new Date().toISOString()
  let rows: QueueRow[] | null = null
  let threw = ''
  try {
    rows = await getQueue(100, clientId)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  // 🔒 Read once, here. The frame's badge comes from the layout's own call to
  // the same function; this one is the page's, for this client.
  const counts = rows === null ? null : await readCounts(clientId)

  const waiting = (rows ?? []).filter((r) => !r.handledElsewhere)
  const handled = (rows ?? []).filter((r) => r.handledElsewhere)
  const outage = detectOutage((rows ?? []).map((r) => ({ at: r.at, reasons: r.reasons })))

  return (
    <Live serverNow={Date.parse(readAt)}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Escalations</h1>
          <p className={styles.sub}>
            Who at {client.name} is waiting for a human. <b>Longest waiting first</b> — a tier never lifts a row
            above an older one.
          </p>
        </div>
        {rows !== null && <Stamp serverAt={readAt} />}
      </header>

      {rows === null ? (
        /* 🔴 It does not say the queue is empty. Until it reads, assume
           somebody is waiting. why-empty.ts owns the sentence. */
        <StateSurface meaning="red" className={styles.banner}>
          <StateMark meaning="red" label="the read failed" />
          <span>
            <b>{whyEmpty({ state: 'readFailed', thing: 'the queue', threw }).sentence}</b>
            <div className={styles.thrown}>{threw}</div>
          </span>
        </StateSurface>
      ) : waiting.length === 0 && handled.length === 0 ? (
        <StateSurface meaning="through" className={styles.banner}>
          <StateMark meaning="through" label="resting" />
          <span>
            {
              whyEmpty({
                state: 'resting',
                thing: 'escalations',
                welcome: true,
              }).sentence
            }
          </span>
        </StateSurface>
      ) : (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>{headline(counts)}</h2>
            <span className={styles.count}>longest first</span>
            <span className={styles.note}>a tier is where the clock sits, not a column</span>
          </div>

          {outage.active && (
            <StateSurface meaning="red" className={styles.banner}>
              <StateMark meaning="red" label="a dependency is down" />
              <span>
                <b>
                  {outage.count} hand-overs in 15 minutes, all the same fault: {humanise(outage.reason ?? '')}.
                </b>{' '}
                Three unrelated faults is a bad afternoon; {outage.count} of the same one is a dependency down. The
                rows are below, unchanged — this counts them, it does not replace them.
              </span>
            </StateSurface>
          )}

          {waiting.map((row) => (
            <Row key={row.id} row={row} />
          ))}

          {handled.length > 0 && (
            <>
              <StateSurface meaning="handled" className={styles.tray}>
                {handled.map((row) => (
                  <Row key={row.id} row={row} />
                ))}
              </StateSurface>
              <p className={styles.trayNote}>
                Neither open nor closed. Somebody replied outside the cockpit and the flag nobody cleared is still
                set — showing these as open sends you to a handled lead, hiding them loses the flag.
              </p>
            </>
          )}
        </section>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>No dismiss, no acknowledge, no snooze — the flag clears by the work being done.</p>
        <p>No bulk hand-back.</p>
        <p>Nothing re-sorts by tier or severity. The clock is the sort.</p>
        <p>No replying from here.</p>
      </div>
    </Live>
  )
}
