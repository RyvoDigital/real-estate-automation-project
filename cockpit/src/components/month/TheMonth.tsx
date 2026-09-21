import { StateChip, StateSurface } from '@/components/state-chip'
import { whyEmpty } from '@/lib/why-empty'
import {
  USAGE, addMonths, eur, monthKey, monthLabel, monthName,
  type CostLine, type Half, type Leaves, type MonthModel,
} from '@/lib/month/model'
import type { ReadFailure } from '@/lib/month/read'
import styles from './month.module.css'

/*
 * The Month, presentational. Brief I §2.10–2.11, design v3.
 *
 * Takes a computed model and renders it; reads nothing and decides nothing.
 * The rules live in lib/month/model.ts and are unit-tested there. This file
 * owes the design its slots: the two halves carry IDENTICAL slots in IDENTICAL
 * order — recurring, the year, clients, costs, what it leaves, one-off — so a
 * full half and an empty one read as two true states, not as a page
 * half-rendered.
 */

type Props = {
  model: MonthModel
  readAt: string
  failures: ReadFailure[]
  /** the month link builder: the page decides the URL shape */
  hrefFor: (m: { y: number; m: number }) => string
}

function Amount({ cents, per }: { cents: number; per?: string }) {
  const s = eur(cents)
  const k = s.lastIndexOf(',')
  return (
    <span className={styles.amt}>
      <span className={styles.big}>{s.slice(0, k)}</span>
      <span className={styles.cents}>{s.slice(k)}</span>
      {per ? <span className={styles.per}>{per}</span> : null}
    </span>
  )
}

function Track({ day, days }: { day: number; days: number }) {
  return (
    <span className={styles.track} role="img" aria-label={`Day ${day} of ${days}`}>
      <i style={{ width: `${((day / days) * 100).toFixed(1)}%` }} />
    </span>
  )
}

function Failed({ thing, messages }: { thing: string; messages: string[] }) {
  const w = whyEmpty({ state: 'readFailed', thing, threw: messages.join(' · ') })
  return (
    <StateSurface meaning="red" className={styles.broke}>
      <span role="alert">{w.sentence}</span>
      {messages.map((m) => <code key={m}>{m}</code>)}
    </StateSurface>
  )
}

/** The year as a step line. 🔒 Nothing is drawn before the first contract — not even a zero. */
function Year({ half }: { half: Half }) {
  const year = half.year!
  const W = 520, H = 150, PL = 4, PR = 46, PT = 12, PB = 22
  const x = (i: number) => PL + ((W - PL - PR) * i) / 11
  const drawn = year.filter((p) => p.cents !== null)
  const max = drawn.length ? Math.max(100, ...drawn.map((p) => p.cents as number)) * 1.2 : 1
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max)
  const labels = year.map((p, i) => (i % 2 === 1 || i === 11) ? (
    <text key={monthKey(p.month)} x={x(i)} y={H - 5} textAnchor={i === 11 ? 'end' : 'middle'} className={i === 11 ? styles.axisNow : styles.axis}>
      {monthName(p.month).slice(0, 3)}{p.month.m === 1 ? ` ’${String(p.month.y).slice(2)}` : ''}
    </text>
  ) : null)
  if (!drawn.length) {
    return (
      <div className={styles.chart}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="No recurring revenue has ever been recorded">
          <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} rx={6} className={styles.chartFrame} />
          {labels}
        </svg>
        <div className={styles.chartMsg}><b>The line starts with the first contract.</b>Nothing is drawn until then — not even a zero.</div>
      </div>
    )
  }
  const pts: [number, number][] = []
  year.forEach((p, i) => {
    if (p.cents === null) return
    if (pts.length) pts.push([x(i), pts[pts.length - 1][1]])
    pts.push([x(i), y(p.cents)])
  })
  const d = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')
  const last = pts[pts.length - 1]
  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Recurring revenue, last twelve months">
        <path d={d} className={styles.line} />
        <circle cx={last[0]} cy={last[1]} r={3.6} className={styles.dot} />
        {labels}
      </svg>
    </div>
  )
}

function Costs({ lines }: { lines: CostLine[] }) {
  if (!lines.length) return <p className={styles.empty}>No cost recorded at this level.</p>
  return (
    <div>
      {lines.map((c) => (
        <div key={c.id} className={styles.cost}>
          <span className={styles.n}>{c.label}{c.note ? <span>{c.note}</span> : null}</span>
          {c.renewsWithin30 ? <StateChip meaning="clock">renews within 30 days</StateChip>
            : <span className={styles.kind}>{c.kind === 'one_off' ? 'one-off' : 'fixed'}</span>}
          <span className={styles.v}>{eur(c.cents)}</span>
        </div>
      ))}
    </div>
  )
}

function LeavesSlot({ leaves, month, note }: { leaves: Leaves; month: MonthModel['month']; note: string }) {
  if (leaves.kind === 'unreadable') return <p className={styles.empty}>Not shown: a read it depends on failed (above).</p>
  if (leaves.kind === 'nothing') return <p className={styles.empty}>Nothing to show: no contract and no cost is recorded for {monthName(month)} here. Not €0 — nothing has started.</p>
  if (leaves.kind === 'withheld') {
    return (
      <div>
        <div className={styles.withheld}>When {monthName(month)} closes<small>usage is still being counted; a figure now would compare a whole month of revenue with part of a month of cost</small></div>
        {leaves.lastClosed ? (
          <div className={styles.prev}>{monthLabel(leaves.lastClosed.month)} left <b>{eur(leaves.lastClosed.cents)}</b> <span className={styles.caveat}>excludes usage — not measured yet</span></div>
        ) : null}
      </div>
    )
  }
  return (
    <div className={styles.contrib}>
      <Amount cents={leaves.cents} per={leaves.completeFromDayOne ? 'this month' : `in ${monthName(month)}`} />
      <span className={styles.note}>{note}</span>
    </div>
  )
}

function HalfView({ half, model, failures }: { half: Half; model: MonthModel; failures: ReadFailure[] }) {
  const web = half.business === 'web'
  const inProgress = model.phase.kind === 'in_progress'
  const contractsFailed = half.recurringCents === null
  const msgs = failures.map((f) => f.message)
  const status = half.everContracted
    ? `${half.clients?.length ?? 0} under contract`
    : web ? 'no web client under contract' : 'being built · no client under contract'
  return (
    <section className={styles.half} aria-label={web ? 'Web' : 'Automations'}>
      <div className={styles.hh}>
        <h2>{web ? 'Web' : 'Automations'}</h2>
        <span className={styles.state}>
          {status}{half.rehearsals ? ` · ${half.rehearsals} rehearsal${half.rehearsals === 1 ? '' : 's'}, not counted` : ''}
        </span>
      </div>

      <div className={styles.slot}>
        <div className={styles.sl}>Recurring</div>
        {contractsFailed ? <Failed thing={`the ${web ? 'web' : 'automation'} contracts`} messages={msgs} />
          : half.everContracted ? <Amount cents={half.recurringCents as number} per="a month" />
            : <><div className={styles.s2}>No contract yet.</div><p className={styles.sub2}>Not €0 this month — nothing has started.</p></>}
      </div>

      <div className={styles.slot}>
        <div className={styles.sl}>The last twelve months</div>
        {half.year ? <Year half={half} /> : <p className={styles.empty}>Not drawn: the contracts could not be read.</p>}
      </div>

      <div className={styles.slot}>
        <div className={styles.sl}>Clients<span>in the order they started, never by fee</span></div>
        {half.clients === null ? <p className={styles.empty}>Not listed: the contracts could not be read.</p> : (
          <>
            {half.clients.length ? (
              <div className={styles.rows}>
                <div className={`${styles.cr} ${styles.hd}`}><span>Client</span><span className={styles.v}>Pays</span></div>
                {half.clients.map((c) => (
                  <div key={c.key} className={styles.cr}>
                    <span className={styles.n}><b>{c.name}</b><span>{c.since}{c.note ? ` · ${c.note}` : ''}</span></span>
                    <span className={styles.v}>{eur(c.monthlyCents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.empty}><b>No client under contract.</b> The first one appears here with its terms, in the order they are signed, never by fee.{!web && half.rehearsals ? ` The ${half.rehearsals} rehearsal clients are not here.` : ''}</p>
            )}
            {half.unknown.length ? (
              <p className={styles.unknown}><StateChip meaning="grey">terms not recorded</StateChip> {half.unknown.length === 1 ? '1 client has' : `${half.unknown.length} clients have`} no contract terms recorded — revenue for {half.unknown.length === 1 ? 'it' : 'them'} is not zero, it is not known: {half.unknown.join(', ')}.</p>
            ) : null}
            {half.conflicts.map((c) => (
              <p key={c.name} className={styles.unknown}><StateChip meaning="red">unresolved</StateChip> {c.name}: {c.why}.</p>
            ))}
            <p className={styles.fine}>What each client alone costs is not recordable yet: a cost belongs to a business or to the company, and nothing records one against a client.</p>
          </>
        )}
      </div>

      <div className={styles.slot}>
        <div className={styles.sl}>Costs of the {web ? 'web' : 'automation'} business<span>{web ? 'shared by every web client — not split' : 'running whether or not there is a client'}</span></div>
        {half.costs === null ? <Failed thing="the costs" messages={msgs} /> : <Costs lines={half.costs} />}
        {!web ? <p className={styles.fine}>{USAGE.why}. These costs exclude usage until it is.</p> : null}
      </div>

      <div className={styles.slot}>
        <div className={styles.sl}>What the {web ? 'web' : 'automation'} business leaves</div>
        <LeavesSlot
          leaves={half.leaves}
          month={model.month}
          note={web ? `complete${inProgress ? ' already' : ''}: the web business has no usage costs`
            : half.everContracted ? 'excludes usage — not measured yet' : 'the cost of building it — real, expected, and not a fault'}
        />
      </div>

      <div className={styles.slot}>
        <div className={styles.sl}>One-off{inProgress ? ' so far' : ''}</div>
        {half.oneOff === null ? <p className={styles.empty}>Not listed: the payments could not be read.</p>
          : half.oneOff.length ? half.oneOff.map((o) => (
            <div key={o.key} className={styles.cost}><span className={styles.n}>{o.label}<span>arrived {o.on}</span></span><span /><span className={styles.v}>{eur(o.cents)}</span></div>
          )) : <p className={styles.empty}>{web ? `None recorded in ${monthName(model.month)}.` : half.everContracted ? `None recorded in ${monthName(model.month)}.` : 'No setup fee has ever been recorded.'}</p>}
        {half.setupOutstanding.map((s) => (
          <p key={s.name} className={styles.unknown}><StateChip meaning="clock">outstanding</StateChip> {s.name}: {eur(s.cents)} of setup contracted and not yet arrived.</p>
        ))}
      </div>
    </section>
  )
}

export function TheMonth({ model, readAt, failures, hrefFor }: Props) {
  const M = model.month
  const p = model.phase
  const inProgress = p.kind === 'in_progress'
  const s = model.sums
  const msgs = failures.map((f) => f.message)
  const at = new Date(readAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })

  const netCell = (() => {
    if (s.net.kind === 'unreadable') return <p className={styles.empty}>Not shown: a read it depends on failed.</p>
    if (s.net.kind === 'nothing') return <span className={styles.withheld}>Nothing to net<small>no contract and no cost is recorded for {monthName(M)}</small></span>
    if (s.net.kind === 'withheld') {
      return (
        <>
          <span className={styles.withheld}>When {monthName(M)} closes<small>a net now would compare a whole month of revenue with part of a month of cost</small></span>
          {inProgress ? <Track day={p.day} days={p.days} /> : null}
          {s.net.lastClosed ? (
            <div className={styles.prev}>Last closed month · {monthName(s.net.lastClosed.month)}: <b>{eur(s.net.lastClosed.cents)}</b> <span className={styles.caveat}>excludes usage — not measured yet</span></div>
          ) : null}
        </>
      )
    }
    return <><Amount cents={s.net.cents} /><span className={styles.d}><span className={styles.caveat}>excludes usage — not measured yet</span></span></>
  })()

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Two businesses, one company</h1>
          <p className={styles.subtitle}>The Month · Ryvo Digital · amounts net of VAT</p>
        </div>
        <nav className={styles.stepper} aria-label="Month">
          <a href={hrefFor(addMonths(M, -1))} aria-label="Previous month">‹</a>
          <span>{monthLabel(M)}{inProgress ? ` · day ${p.day} of ${p.days}` : p.kind === 'closed' ? ' · closed' : ' · not started'}</span>
          {/* No next arrow while the month is in progress: there is no later month to show, and a disabled control is refused here (probe: no control is disabled). */}
          {inProgress ? null : <a href={hrefFor(addMonths(M, 1))} aria-label="Next month">›</a>}
        </nav>
        <span className={styles.readAt}>read {at} Lisbon</span>
      </div>

      {model.neverAnything ? (
        <p className={styles.thesis}><b>No contract has been recorded.</b> Ryvo has no recorded revenue yet — this is the beginning, not a fault.</p>
      ) : s.recurringCents !== null ? (
        <p className={styles.thesis}>
          Ryvo Digital {p.kind === 'closed' ? 'earned' : 'earns'} <b>{eur(s.recurringCents)} a month in recurring revenue</b>{p.kind === 'closed' ? ` in ${monthLabel(M)}` : ''}.
          {inProgress ? ` ${monthName(M)} is ${p.day} of ${p.days} days in: its costs are still being counted, so what the month leaves is shown when it closes — not before.` : ''}
        </p>
      ) : null}

      <div className={styles.sums} aria-label="The company's sums">
        <div className={styles.sum}>
          <span className={styles.l}>Recurring revenue</span>
          {s.recurringCents === null ? <p className={styles.empty}>Not shown: the contracts could not be read.</p>
            : !model.halves.web.everContracted && !model.halves.automation.everContracted ? <><span className={styles.withheld}>None recorded</span><span className={styles.d}>no contract has ever been recorded</span></> : <>
            <Amount cents={s.recurringCents} per="a month" />
            <span className={styles.d}>web <b>{s.composition!.web ? eur(s.composition!.web) : 'none yet'}</b> · automations <b>{s.composition!.automation ? eur(s.composition!.automation) : 'none yet'}</b></span>
          </>}
        </div>
        <div className={styles.sum}>
          <span className={styles.l}>One-off{inProgress ? ' so far' : ''}</span>
          {s.oneOffCents === null ? <p className={styles.empty}>Not shown: the payments could not be read.</p>
            : s.oneOffCents ? <Amount cents={s.oneOffCents} /> : <span className={styles.withheld}>None recorded</span>}
          <span className={styles.d}>never added to recurring</span>
        </div>
        <div className={styles.sum}>
          <span className={styles.l}>Costs{inProgress ? ' so far' : ''}</span>
          {s.costCents === null ? <p className={styles.empty}>Not shown: the costs could not be read.</p>
            : ![...(model.halves.web.costs ?? []), ...(model.halves.automation.costs ?? []), ...(model.company.costs ?? [])].length
              ? <><span className={styles.withheld}>None recorded</span><span className={styles.d}>no cost is recorded for {monthName(M)} · usage is not measured yet</span></> : <>
            <Amount cents={s.costCents} />
            <span className={styles.d}>{s.costCents ? 'fixed and one-off as recorded' : 'no cost recorded'} · excludes usage, not measured yet</span>
          </>}
        </div>
        <div className={styles.sum} aria-label="Recurring minus costs">
          <span className={styles.l}>Recurring minus costs</span>
          {netCell}
        </div>
      </div>

      {model.failed.length ? <Failed thing={`part of ${monthLabel(M)} (${model.failed.join(', ')})`} messages={msgs} /> : null}

      <div className={styles.halves}>
        <HalfView half={model.halves.web} model={model} failures={failures} />
        <HalfView half={model.halves.automation} model={model} failures={failures} />
      </div>

      <div className={styles.two}>
        <section className={styles.card} aria-label="Costs of the company">
          <h2>Costs of the company</h2>
          <p className={styles.intro}>Belong to neither business and are never split between them.</p>
          {model.company.costs === null ? <Failed thing="the company's costs" messages={msgs} /> : <Costs lines={model.company.costs} />}
        </section>
        <section className={styles.card} aria-label="Invoices to check">
          <h2>Invoices to check</h2>
          <p className={styles.intro}>{whyEmpty({
            state: 'notBuilt',
            thing: 'the monthly invoice check for the two suppliers that bill by usage',
            haveWhat: `${USAGE.why}, so there is no computed figure to check an invoice against`,
            when: 'it comes with usage measurement, which is not scheduled yet',
          }).sentence}</p>
        </section>
      </div>

      <section className={styles.card} aria-label="What the system did, and Firsts">
        <h2>What the automation business did, what is holding it, and Firsts</h2>
        <p className={styles.intro}>{whyEmpty({
          state: 'notBuilt',
          thing: 'the approved panels beneath the halves — what the system did per automation, what is holding it, and the Firsts register',
          haveWhat: 'they read events, messages and the waiting room, which this checkpoint does not',
          when: 'the next checkpoint builds them, with the forms',
        }).sentence}</p>
      </section>

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>No net for a month still in progress. A whole month of revenue against part of a month of cost looks current and is not.</p>
        <p>No shared cost is split between clients or businesses. Each cost sits at its own level: a business, or the company.</p>
        <p>Recurring and one-off revenue are never added into one figure.</p>
        <p>No client is ranked. Clients are listed in the order they started, never by fee.</p>
        <p>No computed cost is shown as a checked one, and last month&rsquo;s costs never stand in for this month&rsquo;s.</p>
        <p>It is not the books. The figures are contracted, not invoiced; the accountant and the invoicing software hold the record.</p>
      </div>
    </div>
  )
}
