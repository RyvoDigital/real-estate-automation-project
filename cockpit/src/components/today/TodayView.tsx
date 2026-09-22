import Link from 'next/link'
import { CLASS_LABEL, humanise, type EscalationClass } from '@/lib/escalation'
import type { QueueRow, AnomalyFeed } from '@/lib/data'
import type { AnomalyGroup } from '@/lib/anomaly'
import type { ExpiryItem } from '@/lib/expiries/model'
import type { TodayGroup, TodayModel, WaitingGate } from '@/lib/today/model'
import { Clock } from '@/components/Clock'
import { StateChip, StateMark, StateSurface, type Meaning } from '@/components/state-chip'
import styles from './today.module.css'

/*
 * Today, drawn. Brief §2.1; the Today rebuild, checkpoint 2 (22 Sep 2026), in
 * The Month's direction: one 4px spacing scale, one rhythm per group header
 * (the name, the count, one preview line), groups separated by space and
 * never by rules, and state colour ONLY through state-chip and the clock.
 *
 * 🔒 IT DECIDES NOTHING. Every count, preview, state and order comes from
 * lib/today/model.ts; this file draws the model and the rows as they were read.
 * 🔒 EVERY GROUP IS COLLAPSED (model.open is always false), and the five keep
 * their fixed positions whatever their state.
 */

const CLASS_MEANING: Record<EscalationClass, Meaning> = { system: 'red', high_value: 'held', person: 'held' }

/** A distribution label's meaning: the tiers and severities that are a fault or a clock take theirs; the rest are grey. */
const DIST_MEANING: Record<string, Meaning> = { breach: 'red', late: 'clock', critical: 'red' }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const whose = (x: ExpiryItem) => (x.owner.kind === 'ryvo' ? 'Ryvo' : x.owner.name)

function Head({ g }: { g: TodayGroup }) {
  return (
    <summary className={styles.head}>
      <span className={styles.ordinal} aria-hidden>{g.n}</span>
      <span className={styles.headMain}>
        <span className={styles.nameLine}>
          <span className={styles.name}>{g.name}</span>
          {g.partial && <StateChip meaning="grey">partial</StateChip>}
          {g.state === 'readFailed' && <StateMark meaning="red" label="the read failed" />}
        </span>
        <span className={styles.count}>{g.count}</span>
        <span className={styles.preview}>{g.preview}</span>
        {g.also && <span className={styles.preview}>{g.also}</span>}
      </span>
      {/* always present, so the disclosure mark sits in one column on every group */}
      <span className={styles.dist}>
        {g.distribution.map((d) => (
          <StateChip key={d.label} meaning={DIST_MEANING[d.label] ?? 'grey'}>{d.n} {d.label}</StateChip>
        ))}
      </span>
      <span className={styles.chev} aria-hidden />
    </summary>
  )
}

function Failed({ g }: { g: TodayGroup }) {
  return (
    <StateSurface meaning="red" className={styles.banner}>
      <StateMark meaning="red" label="the read failed" />
      {/* the sentence is already the header's preview; the banner carries what was thrown, as thrown */}
      <span>
        <b>What the read threw</b>
        <code className={styles.detail}>{g.detail ?? 'nothing was thrown with a message'}</code>
      </span>
    </StateSurface>
  )
}

function QueueItem({ row }: { row: QueueRow }) {
  const handled = row.handledElsewhere && row.handledAt !== null
  return (
    <Link href={`/c/${row.clientId}/contacts/${row.id}`} className={styles.row}>
      <span className={styles.initials}>
        {initials(row.name)}
        {row.primary === 'system' && <span className={styles.badge}><StateMark meaning="red" label="something broke" /></span>}
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{humanise(row.reasons[0] ?? '')}</span>
        <span className={styles.rowLine}>
          {/* 🔒 every row names its client */}
          <span>{row.clientName} · {row.name}</span>
          {row.classes.map((c) => <StateChip key={c} meaning={CLASS_MEANING[c]}>{CLASS_LABEL[c]}</StateChip>)}
        </span>
      </span>
      {handled ? (
        <Clock at={row.handledAt} serverMinutes={Math.max(0, Math.floor((Date.now() - Date.parse(row.handledAt as string)) / 60000))} word="since the reply" untiered />
      ) : (
        <Clock at={row.at} serverMinutes={row.minutes} />
      )}
    </Link>
  )
}

function AnomalyItem({ g, windowDays }: { g: AnomalyGroup; windowDays: number }) {
  return (
    <div className={styles.row}>
      <span className={styles.markBare}><StateMark meaning={g.latest.severity === 'critical' ? 'red' : 'grey'} label={g.latest.severity} /></span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{g.latest.label}</span>
        {/* 🔒 the event's OWN summary: a second formatter here would drift from the one the WhatsApp carried */}
        <span className={styles.rowLine}>{g.latest.summary}</span>
      </span>
      <span className={styles.aside}><b>{g.count}×</b><span>in the last {windowDays} days</span></span>
    </div>
  )
}

function ExpiryRow({ x }: { x: ExpiryItem }) {
  const meaning: Meaning = x.standing === 'past' || x.standing === 'not_valid' ? 'red' : x.standing === 'soon' ? 'clock' : 'grey'
  const word = x.standing === 'past' ? 'run out' : x.standing === 'not_valid' ? 'not valid' : x.standing === 'soon' ? 'soon' : x.standing === 'unknown' ? 'not asserted' : 'to confirm'
  const when = x.days === null || x.kind === 'registration'
    ? (x.date ? day(x.date) : null)
    : x.days < 0 ? `${-x.days} day${x.days === -1 ? '' : 's'} ago` : `in ${x.days} day${x.days === 1 ? '' : 's'}`
  const inner = (
    <>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{x.what}</span>
        <span className={styles.rowLine}>
          {whose(x)}{x.date && x.days !== null && x.kind !== 'registration' ? ` · ${day(x.date)}` : ''}{x.note ? ` · ${x.note}` : ''}
        </span>
      </span>
      <span className={styles.aside}>
        {when && <b>{when}</b>}
        <StateChip meaning={meaning}>{word}</StateChip>
      </span>
    </>
  )
  // A client's document or registration opens that client's "What is still good"; Ryvo's own key has no page yet (C5).
  return x.owner.kind === 'client'
    ? <Link href={`/c/${x.owner.id}/still-good`} className={`${styles.row} ${styles.rowPlain}`}>{inner}</Link>
    : <div className={`${styles.row} ${styles.rowPlain}`}>{inner}</div>
}

function GateRow({ w, now }: { w: WaitingGate; now: number }) {
  const at = w.since ? `${w.since}T00:00:00Z` : null
  return (
    <div className={`${styles.row} ${styles.rowPlain}`}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{w.what}</span>
        <span className={styles.rowLine}>
          <span>held by {w.whoHolds}</span>
          <StateChip meaning="grey">{w.answerable === 'the agency' ? 'the agency can end it' : 'nobody here can end it'}</StateChip>
        </span>
      </span>
      <span className={styles.aside}>
        {at ? (
          <>
            <Clock at={at} serverMinutes={Math.max(0, Math.floor((now - Date.parse(at)) / 60000))} scale="days" word={`since ${day(w.since!)}`} />
          </>
        ) : (
          <StateChip meaning="grey">since unknown</StateChip>
        )}
      </span>
    </div>
  )
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className={styles.rows}>{children}</div>
}

function SubList({ label, count, children }: { label: string; count: string; children: React.ReactNode }) {
  return (
    <section className={styles.sub}>
      <h3 className={styles.subLabel}>{label}<span>{count}</span></h3>
      {children}
    </section>
  )
}

export function TodayView({ model, queue, anomalies, windowDays, now }: {
  model: TodayModel
  queue: QueueRow[] | null
  anomalies: AnomalyFeed | null
  windowDays: number
  now: number
}) {
  if (model.never) {
    return <p className={styles.never}>{model.never}</p>
  }
  const [g1, g2, g3, g4, g5] = model.groups
  const waiting = (queue ?? []).filter((r) => !r.handledElsewhere)
  const handled = (queue ?? []).filter((r) => r.handledElsewhere)

  return (
    <ol className={styles.groups}>
      {/* ── 1 ── */}
      <li><details className={styles.group} id="group-1" data-state={g1.state}>
        <Head g={g1} />
        <div className={styles.body}>
          {g1.state === 'readFailed' ? <Failed g={g1} /> : (
            <>
              {model.outage.active && (
                <StateSurface meaning="red" className={styles.banner}>
                  <StateMark meaning="red" label="a dependency is down" />
                  <span>
                    <b>{model.outage.count} hand-overs in 15 minutes, all the same fault: {humanise(model.outage.reason ?? '')}.</b>{' '}
                    Three of one fault is a dependency down, not three problems.
                    <span className={styles.links}>
                      <a href="#group-2">See what else broke in the same window</a>
                      <Link href="/health">See what the system was doing</Link>
                    </span>
                  </span>
                </StateSurface>
              )}
              {waiting.length > 0 && <Rows>{waiting.map((r) => <QueueItem key={r.id} row={r} />)}</Rows>}
              {handled.length > 0 && (
                <SubList label="Handled elsewhere" count={`${handled.length}`}>
                  <StateSurface meaning="handled" className={styles.tray}>
                    {handled.map((r) => <QueueItem key={r.id} row={r} />)}
                  </StateSurface>
                  <p className={styles.note}>Neither open nor closed: somebody replied outside the cockpit, and the flag nobody cleared is still set.</p>
                </SubList>
              )}
            </>
          )}
        </div>
      </details></li>

      {/* ── 2 ── */}
      <li><details className={styles.group} id="group-2" data-state={g2.state}>
        <Head g={g2} />
        <div className={styles.body}>
          {g2.state === 'readFailed' ? <Failed g={g2} /> : g2.state === 'rows' && anomalies
            ? <Rows>{anomalies.groups.map((a) => <AnomalyItem key={a.latest.kind} g={a} windowDays={windowDays} />)}</Rows>
            : null}
        </div>
      </details></li>

      {/* ── 3 ── */}
      <li><details className={styles.group} id="group-3" data-state={g3.state}>
        <Head g={g3} />
        <div className={styles.body}>
          <p className={styles.note}>{g3.partial}</p>
          {g3.state === 'readFailed' ? <Failed g={g3} /> : (
            <>
              {g3.detail && <p className={styles.failNote}><StateMark meaning="red" label="partly unread" /> {g3.detail}</p>}
              {model.runOut.length > 0 && <Rows>{model.runOut.map((x) => <ExpiryRow key={x.key} x={x} />)}</Rows>}
            </>
          )}
        </div>
      </details></li>

      {/* ── 4: two lists, two clocks, never merged ── */}
      <li><details className={styles.group} id="group-4" data-state={g4.state}>
        <Head g={g4} />
        <div className={styles.body}>
          <p className={styles.note}>{g4.partial}</p>
          {g4.state === 'readFailed' ? <Failed g={g4} /> : (
            <>
              {g4.detail && <p className={styles.failNote}><StateMark meaning="red" label="partly unread" /> {g4.detail}</p>}
              <SubList label={`Within ${model.warnWithinDays} days`} count={model.aboutTo.length ? `${model.aboutTo.length}, fewest days left first` : 'none'}>
                {model.aboutTo.length > 0 && <Rows>{model.aboutTo.map((x) => <ExpiryRow key={x.key} x={x} />)}</Rows>}
              </SubList>
              <SubList label="To confirm" count={model.toConfirm.length ? `${model.toConfirm.length}, never checked first` : 'none'}>
                {model.toConfirm.length > 0 && <Rows>{model.toConfirm.map((x) => <ExpiryRow key={x.key} x={x} />)}</Rows>}
              </SubList>
            </>
          )}
        </div>
      </details></li>

      {/* ── 5: the plain list (decided 22 Sep 2026, recorded in gates.ts). Read-only: no actions. ── */}
      <li><details className={styles.group} id="group-5" data-state={g5.state}>
        <Head g={g5} />
        <div className={styles.body}>
          {model.waiting.length > 0 && <Rows>{model.waiting.map((w) => <GateRow key={w.id} w={w} now={now} />)}</Rows>}
          <p className={styles.note}>Oldest first. A gate whose start was never recorded goes last and says so. From the gated ledger; it changes when a gate opens there.</p>
        </div>
      </details></li>
    </ol>
  )
}

/** "What this page does not do", behind the ⓘ beside the title. */
export function NotDone() {
  return (
    <details className={styles.about}>
      <summary aria-label="What this page does not do">ⓘ</summary>
      <div className={styles.aboutBody}>
        <h2>What this page does not do</h2>
        <p>Nothing is ranked across groups: the order is editorial, not a computed priority.</p>
        <p>No dismissing, acknowledging or snoozing. A flag clears by the work being done.</p>
        <p>No replying from here, and no acting on a gate: group 5 is read-only.</p>
        <p>No group is hidden for being empty, and every group opens closed.</p>
      </div>
    </details>
  )
}
