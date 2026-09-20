import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { ANOMALY_WINDOW_DAYS, getAnomalies, getQueue, type QueueRow } from '@/lib/data'
import { readCounts } from '@/lib/counts'
import { CLASS_LABEL, detectOutage, humanise, type EscalationClass } from '@/lib/escalation'
import { whyEmpty, type Emptiness } from '@/lib/why-empty'
import { Frame } from '@/components/Frame'
import { Live } from '@/components/Live'
import { Clock } from '@/components/Clock'
import { Stamp } from '@/components/Stamp'
import { StateChip, StateMark, StateSurface, type Meaning } from '@/components/state-chip'
import type { AnomalyGroup } from '@/lib/anomaly'
import styles from './today.module.css'

/*
 * Q1 — what needs me this morning. Brief §2.1.
 *
 * 🔒 FIVE GROUPS IN A FIXED ORDER, NEVER SORTED ACROSS. The order is a
 * declared editorial decision, not a computed priority: ranking across
 * incommensurable clocks — minutes for an escalation, days for a certificate,
 * weeks for a lawyer — would be inventing a threshold, and §4.6 refuses that.
 * Within a group, the group's own clock sorts.
 *
 * 🔴 AND THREE OF THE FIVE SAY "WE HAVE NOT BUILT THIS".
 *
 * Groups 3, 4 and 5 have no assembling read. The tables exist for 3 and 4 and
 * the re-check logic is written; nothing calls it. Group 5 has no source at
 * all — the waiting room is not a table anywhere, only a document.
 *
 * The build plan said to withhold a screen in that state. The operator
 * overruled it for this one: hiding the three would make the landing look
 * complete while lying by omission, and a landing showing honest gaps is more
 * useful than one showing two groups and pretending that is the whole morning.
 * So they render, in their fixed positions, saying what is missing and when it
 * arrives.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CLASS_MEANING: Record<EscalationClass, Meaning> = {
  system: 'red',
  high_value: 'held',
  person: 'held',
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

/** A group that has no assembling read yet, in its own position. */
const UNBUILT: Record<3 | 4 | 5, Emptiness & { state: 'notBuilt' }> = {
  3: {
    state: 'notBuilt',
    thing: 'clearances that have run out',
    haveWhat:
      'the facts are recorded in listing_facts and agency_facts, and the lapse logic is written in publication/recheck.ts, but nothing assembles them into a list',
    when: 'it arrives with the compliance screens',
  },
  4: {
    state: 'notBuilt',
    thing: 'certificates and registrations about to run out',
    haveWhat: 'the same tables and the same logic, including the 30-day warning and the 90-day re-confirmation',
    when: 'it arrives with the compliance screens, beside group 3',
  },
  5: {
    state: 'notBuilt',
    thing: "what we are waiting on somebody else for — Meta's verification, the lawyer's answer",
    // 🔴 A harder gap than the other two, and it says so: those have tables
    // and need a reader; this has no source in the database at all.
    haveWhat:
      'nothing holds these. They are written in documents and nowhere else, so there is no table to read and no reader to write',
    when: 'it needs a decision about where they live before it can be built',
  },
}

function Group({
  ordinal,
  name,
  children,
  count,
  preview,
  open,
}: {
  ordinal: number
  name: string
  count: React.ReactNode
  preview?: React.ReactNode
  open?: boolean
  children: React.ReactNode
}) {
  return (
    <details className={styles.group} id={`group-${ordinal}`} open={open}>
      <summary className={styles.summary}>
        <span className={styles.ordinal}>{ordinal}</span>
        <span className={styles.name}>{name}</span>
        <span className={styles.count}>{count}</span>
        {preview && <span className={styles.preview}>{preview}</span>}
      </summary>
      {children}
    </details>
  )
}

function QueueRowItem({ row }: { row: QueueRow }) {
  const handled = row.handledElsewhere && row.handledAt !== null
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
          {/* 🔒 Every row names its client. A row without one is an
              operator-level item, and that is legible precisely because every
              other row has one. */}
          <span>{row.clientName}</span>
          <span>· {row.name}</span>
          {row.classes.map((c) => (
            <StateChip key={c} meaning={CLASS_MEANING[c]}>
              {CLASS_LABEL[c]}
            </StateChip>
          ))}
        </span>
      </span>
      {handled ? (
        <Clock
          at={row.handledAt}
          serverMinutes={Math.max(0, Math.floor((Date.now() - Date.parse(row.handledAt as string)) / 60000))}
          word="since the reply"
          untiered
        />
      ) : (
        <Clock at={row.at} serverMinutes={row.minutes} />
      )}
    </Link>
  )
}

function AnomalyRowItem({ g }: { g: AnomalyGroup }) {
  return (
    <div className={styles.row}>
      <span style={{ display: 'grid', placeItems: 'center' }}>
        <StateMark meaning={g.latest.severity === 'critical' ? 'red' : 'grey'} label={g.latest.severity} />
      </span>
      <span>
        <span className={styles.verb}>{g.latest.label}</span>
        {/* 🔒 The row renders the event's OWN summary. A second formatter in
            the cockpit would drift from the one the WhatsApp carried, and the
            two would disagree about the same event. */}
        <span className={styles.summaryText}>{g.latest.summary}</span>
      </span>
      <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-3)' }}>
        {/* 🔒 The count carries its window, because the window IS the claim.
            "37×" alone is a claim about all time. */}
        <b style={{ fontFamily: 'var(--display)', fontSize: 15, color: 'var(--text)' }}>{g.count}×</b>
        <br />
        in the last {ANOMALY_WINDOW_DAYS} days
      </span>
    </div>
  )
}

export default async function TodayPage() {
  const operator = await requireOperator()
  const readAt = new Date().toISOString()

  let rows: QueueRow[] | null = null
  let queueThrew = ''
  try {
    rows = await getQueue(100)
  } catch (e) {
    queueThrew = e instanceof Error ? e.message : String(e)
  }

  let anomalies: Awaited<ReturnType<typeof getAnomalies>> | null = null
  let anomThrew = ''
  try {
    anomalies = await getAnomalies()
  } catch (e) {
    anomThrew = e instanceof Error ? e.message : String(e)
  }

  const counts = await readCounts()
  const waiting = (rows ?? []).filter((r) => !r.handledElsewhere)
  const handled = (rows ?? []).filter((r) => r.handledElsewhere)
  const outage = detectOutage((rows ?? []).map((r) => ({ at: r.at, reasons: r.reasons })))
  const worst = waiting[0]
  const newestAnomaly = anomalies?.groups[0]

  return (
    <Frame mode="operator" current="today" counts={counts} operatorEmail={operator.email}>
      <Live serverNow={Date.parse(readAt)}>
        <header className={styles.head}>
          <h1 className={styles.title}>Today</h1>
          <Stamp serverAt={readAt} />
        </header>

        <div className={styles.groups}>
          {/* ─────────────── 1 ─────────────── */}
          <Group
            ordinal={1}
            name="Waiting on a human"
            count={
              rows === null ? (
                'could not be read'
              ) : waiting.length === 0 ? (
                'nobody'
              ) : (
                <>
                  <b>{waiting.length}</b> {waiting.length === 1 ? 'lead' : 'leads'}
                  {handled.length > 0 && <> · {handled.length} handled elsewhere</>}
                </>
              )
            }
            preview={
              rows === null ? (
                <>{whyEmpty({ state: 'readFailed', thing: 'the queue', threw: queueThrew }).sentence}</>
              ) : worst ? (
                <>
                  Longest: <b>{humanise(worst.reasons[0] ?? '')}</b> — {worst.clientName}
                </>
              ) : (
                <>{whyEmpty({ state: 'resting', thing: 'escalations', welcome: true }).sentence}</>
              )
            }
            open={rows !== null && waiting.length > 0}
          >
            <div className={styles.body}>
              {rows === null ? (
                <StateSurface meaning="red" className={styles.banner}>
                  <StateMark meaning="red" label="the read failed" />
                  <span>
                    <b>{whyEmpty({ state: 'readFailed', thing: 'the queue', threw: queueThrew }).sentence}</b>
                  </span>
                </StateSurface>
              ) : (
                <>
                  {outage.active && (
                    <StateSurface meaning="red" className={styles.banner}>
                      <StateMark meaning="red" label="a dependency is down" />
                      <span>
                        <b>
                          {outage.count} hand-overs in 15 minutes, all the same fault:{' '}
                          {humanise(outage.reason ?? '')}.
                        </b>{' '}
                        Three of one fault is a dependency down, not three problems.
                        {/* 🔒 Two links, because a claim nobody can check is
                            the shape this system refuses. An incident that
                            produced three leads is a different fact from three
                            unrelated leads, and the reader has to be able to
                            go and see which.

                            Note what they are NOT: "see the leads it produced"
                            would point at the rows immediately below this
                            banner, inside the same group. A link to what the
                            reader is already looking at is not a check. */}
                        <span className={styles.links}>
                          <a href="#group-2">See what else broke in the same window</a>
                          <Link href="/health">See what the system was doing</Link>
                        </span>
                      </span>
                    </StateSurface>
                  )}
                  {waiting.map((r) => (
                    <QueueRowItem key={r.id} row={r} />
                  ))}
                  {handled.length > 0 && (
                    <>
                      <StateSurface meaning="handled" className={styles.tray}>
                        {handled.map((r) => (
                          <QueueRowItem key={r.id} row={r} />
                        ))}
                      </StateSurface>
                      <p className={styles.trayNote}>
                        Neither open nor closed — somebody replied outside the cockpit and the flag nobody cleared
                        is still set.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </Group>

          {/* ─────────────── 2 ─────────────── */}
          <Group
            ordinal={2}
            name="Something went wrong"
            count={
              anomalies === null ? (
                'could not be read'
              ) : anomalies.groups.length === 0 ? (
                `none in the last ${ANOMALY_WINDOW_DAYS} days`
              ) : (
                <>
                  <b>{anomalies.groups.length}</b> {anomalies.groups.length === 1 ? 'fault' : 'faults'} ·{' '}
                  {anomalies.capped ? `${anomalies.total}+` : anomalies.total} occurrences in the last{' '}
                  {ANOMALY_WINDOW_DAYS} days
                </>
              )
            }
            preview={
              anomalies === null ? (
                <>{whyEmpty({ state: 'readFailed', thing: 'the anomaly log', threw: anomThrew }).sentence}</>
              ) : newestAnomaly ? (
                <>
                  Newest: <b>{newestAnomaly.latest.label}</b> — {newestAnomaly.count}× in the last{' '}
                  {ANOMALY_WINDOW_DAYS} days
                </>
              ) : (
                <>
                  {
                    whyEmpty({
                      state: 'resting',
                      thing: 'anomalies',
                      scope: `in the last ${ANOMALY_WINDOW_DAYS} days`,
                    }).sentence
                  }
                </>
              )
            }
          >
            <div className={styles.body}>
              {anomalies === null ? (
                <StateSurface meaning="red" className={styles.banner}>
                  <StateMark meaning="red" label="the read failed" />
                  <span>
                    <b>{whyEmpty({ state: 'readFailed', thing: 'the anomaly log', threw: anomThrew }).sentence}</b>
                  </span>
                </StateSurface>
              ) : (
                anomalies.groups.map((g) => <AnomalyRowItem key={g.latest.kind} g={g} />)
              )}
            </div>
          </Group>

          {/* ─────────────── 3, 4, 5 — not built ─────────────── */}
          {([3, 4, 5] as const).map((n) => {
            const e = UNBUILT[n]
            const name = { 3: 'Something has run out', 4: 'Something is about to run out', 5: 'Waiting on someone else' }[n]
            return (
              <Group key={n} ordinal={n} name={name} count="not built yet" open>
                <p className={styles.notBuilt}>{whyEmpty(e).sentence}</p>
              </Group>
            )
          })}
        </div>

        <div className={styles.absent}>
          <h2>What this page does not do</h2>
          <p>Nothing is sorted across groups — the order is editorial, not a computed priority.</p>
          <p>No dismissing, acknowledging or snoozing. A flag clears by the work being done.</p>
          <p>No replying from here.</p>
          <p>No group is hidden for being empty, and none for being unbuilt.</p>
        </div>
      </Live>
    </Frame>
  )
}
