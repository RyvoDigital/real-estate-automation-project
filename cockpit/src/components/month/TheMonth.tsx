import { Signed, StateChip, StateSurface } from '@/components/state-chip'
import { whyEmpty } from '@/lib/why-empty'
import {
  addMonths, eur, monthKey, monthLabel, monthName,
  type CostLine, type Half, type Leaves, type MonthModel,
} from '@/lib/month/model'
import type { ReadFailure } from '@/lib/month/read'
import styles from './month.module.css'

/*
 * The Month, presentational. Brief I §2.10–2.11, design v3, redesigned 21 Sep
 * 2026 on the operator's review ("the spacing reads thrown together, and the
 * page is bland").
 *
 * One rhythm everywhere: a block is a LABEL, a FIGURE, and at most ONE
 * supporting line. Sections are separated by space, never by stacked rules.
 * Each business has its accent (tokens --web / --automation) in its heading and
 * its chart; what a business leaves reads green or red by its sign (Signed, in
 * state-chip, which owns the semantic colours); a renewal stays amber.
 *
 * It renders a computed model and decides nothing: the rules are in
 * lib/month/model.ts and are unit-tested there. The halves keep IDENTICAL
 * slots in IDENTICAL order, so a full half and an empty one read as two states.
 */

type Props = {
  model: MonthModel
  readAt: string
  failures: ReadFailure[]
  hrefFor: (m: { y: number; m: number }) => string
}

const SHORT = (m: { y: number; m: number }) => monthName(m).slice(0, 3)
const endOf = (m: { y: number; m: number }) => `${new Date(Date.UTC(m.y, m.m, 0)).getUTCDate()} ${SHORT(m)}`

function Money({ cents, per }: { cents: number; per?: string }) {
  const s = eur(cents)
  const k = s.lastIndexOf(',')
  return (
    <span className={styles.money}>
      {s.slice(0, k)}<span className={styles.cents}>{s.slice(k)}</span>
      {per ? <span className={styles.per}>{per}</span> : null}
    </span>
  )
}

/** A block: label, figure, one supporting line. The page's only rhythm. */
function Block({ label, aside, children, line }: { label: string; aside?: string; children: React.ReactNode; line?: React.ReactNode }) {
  return (
    <div className={styles.block}>
      <div className={styles.label}><span>{label}</span>{aside ? <span className={styles.aside}>{aside}</span> : null}</div>
      <div className={styles.figure}>{children}</div>
      {line ? <div className={styles.line}>{line}</div> : null}
    </div>
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

/** The year, in the business's accent. 🔒 No line before the first contract — not even a zero. */
function Year({ half }: { half: Half }) {
  const year = half.year!
  const W = 560, H = 120, PT = 10, PB = 20
  const x = (i: number) => (W * (i + 0.5)) / 12 // the middle of month i's column
  const drawn = year.filter((p) => p.cents !== null)
  const max = Math.max(100, ...drawn.map((p) => p.cents as number)) * 1.25
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max)
  const axis = year.map((p, i) => (i % 3 === 2 || i === 11) ? (
    <text key={monthKey(p.month)} x={x(i)} y={H - 4} textAnchor="middle" className={i === 11 ? styles.tickNow : styles.tick}>
      {SHORT(p.month)}{p.month.m === 1 ? ` ’${String(p.month.y).slice(2)}` : ''}
    </text>
  ) : null)
  if (!drawn.length) {
    return (
      <figure className={styles.chart} data-business={half.business}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="No recurring revenue has ever been recorded">
          <rect x={0} y={PT} width={W} height={H - PT - PB} rx={10} className={styles.chartGround} />
          {axis}
        </svg>
        <figcaption className={styles.chartNote}>Starts with the first contract — nothing is drawn until then.</figcaption>
      </figure>
    )
  }
  // Each month is a flat segment across its own width, so one month drawn is
  // still a visible step — never a lone dot that reads as nothing.
  const seg = (i: number) => [(W * i) / 12, (W * (i + 1)) / 12] as const
  const pts: [number, number][] = []
  year.forEach((p, i) => {
    if (p.cents === null) return
    const [a, b] = seg(i)
    pts.push([a, y(p.cents)], [b, y(p.cents)])
  })
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - PB} L${pts[0][0].toFixed(1)} ${H - PB} Z`
  const last = pts[pts.length - 1]
  return (
    <figure className={styles.chart} data-business={half.business}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Recurring revenue, last twelve months">
        <path d={area} className={styles.area} />
        <path d={line} className={styles.stroke} vectorEffect="non-scaling-stroke" />
        <circle cx={last[0]} cy={last[1]} r={3.5} className={styles.dot} />
        {axis}
      </svg>
    </figure>
  )
}

function CostRows({ lines }: { lines: CostLine[] }) {
  if (!lines.length) return <span className={styles.none}>None recorded</span>
  return (
    <ul className={styles.rows}>
      {lines.map((c) => (
        <li key={c.id} className={styles.row}>
          <span className={styles.rowName}>{c.label}{c.note ? <small>{c.note}</small> : null}</span>
          {c.renewsWithin30 ? <StateChip meaning="clock">renews soon</StateChip> : <span />}
          <span className={styles.amount}>{eur(c.cents)}</span>
        </li>
      ))}
    </ul>
  )
}

/** What a business (or the company) leaves: a signed figure, a withheld date, or nothing. */
function LeavesFigure({ leaves, month }: { leaves: Leaves; month: MonthModel['month'] }) {
  if (leaves.kind === 'unreadable') return <span className={styles.none}>Not shown — a read failed</span>
  if (leaves.kind === 'nothing') return <span className={styles.none}>Nothing recorded</span>
  if (leaves.kind === 'withheld') return <span className={styles.withheld}>After {endOf(month)}</span>
  return <Signed cents={leaves.cents}><Money cents={leaves.cents} /></Signed>
}
function LeavesLine({ leaves, web }: { leaves: Leaves; web: boolean }) {
  if (leaves.kind === 'withheld') {
    return leaves.lastClosed
      ? <>Costs still counting · {SHORT(leaves.lastClosed.month)} <Signed cents={leaves.lastClosed.cents}>{eur(leaves.lastClosed.cents)}</Signed></>
      : <>Costs still counting</>
  }
  if (leaves.kind === 'value') return <>{web ? (leaves.completeFromDayOne ? 'Complete already — no usage costs' : 'No usage costs') : 'Excludes usage'}</>
  return null
}

function HalfView({ half, model, failures }: { half: Half; model: MonthModel; failures: ReadFailure[] }) {
  const web = half.business === 'web'
  const inProgress = model.phase.kind === 'in_progress'
  const msgs = failures.map((f) => f.message)
  const status = half.everContracted
    ? `${half.clients?.length ?? 0} under contract`
    : web ? 'No client under contract' : 'Being built · no client under contract'
  return (
    <section className={styles.half} data-business={half.business} aria-label={web ? 'Web' : 'Automations'}>
      <header className={styles.halfHead}>
        <h2>{web ? 'Web' : 'Automations'}</h2>
        <span>{status}{half.rehearsals ? ` · ${half.rehearsals} rehearsal${half.rehearsals === 1 ? '' : 's'} not counted` : ''}</span>
      </header>

      <Block label="Recurring" line={half.everContracted && half.monthCents !== null && half.monthCents !== half.recurringCents ? <>This month {eur(half.monthCents)} · prorated</> : undefined}>
        {half.recurringCents === null ? <Failed thing={`the ${web ? 'web' : 'automation'} contracts`} messages={msgs} />
          : half.everContracted ? <Money cents={half.recurringCents} per="/ month" />
            : <span className={styles.none}>No contract yet</span>}
      </Block>

      <Block label="Twelve months">
        {half.year ? <Year half={half} /> : <span className={styles.none}>Not drawn — a read failed</span>}
      </Block>

      <Block label="Clients" aside="in order of signing">
        {half.clients === null ? <span className={styles.none}>Not listed — a read failed</span> : (
          <>
            {half.clients.length ? (
              <ul className={styles.rows}>
                {half.clients.map((c) => (
                  <li key={c.key} className={styles.row}>
                    <span className={styles.rowName}>{c.name}<small>{c.note ?? c.since}</small></span>
                    {c.ownRenewsSoon ? <StateChip meaning="clock">renews soon</StateChip>
                      : <span className={styles.amountDim}>{c.ownCents ? `own −${eur(c.ownCents)}` : ''}</span>}
                    <span className={styles.amount}>{eur(c.monthCents)}</span>
                  </li>
                ))}
              </ul>
            ) : <span className={styles.none}>None yet</span>}
            {half.unknown.length ? (
              <p className={styles.flag}><StateChip meaning="grey">terms unknown</StateChip>{half.unknown.join(', ')} — not €0, not known</p>
            ) : null}
            {half.conflicts.map((c) => (
              <p key={c.name} className={styles.flag}><StateChip meaning="red">unresolved</StateChip>{c.name}: status says it left, contract has no end</p>
            ))}
          </>
        )}
      </Block>

      <Block label="Costs" aside={web ? 'the business, not split' : undefined} line={!web ? 'Excludes usage — not measured yet' : undefined}>
        {half.costs === null ? <Failed thing="the costs" messages={msgs} /> : <CostRows lines={half.costs} />}
      </Block>

      <Block label="Leaves" line={<LeavesLine leaves={half.leaves} web={web} />}>
        <LeavesFigure leaves={half.leaves} month={model.month} />
      </Block>

      <Block label={`One-off${inProgress ? ' so far' : ''}`} line={half.setupOutstanding.length ? <>Setup outstanding · {half.setupOutstanding.map((s) => `${s.name} ${eur(s.cents)}`).join(', ')}</> : undefined}>
        {half.oneOff === null ? <span className={styles.none}>Not listed — a read failed</span>
          : half.oneOff.length ? (
            <ul className={styles.rows}>
              {half.oneOff.map((o) => (
                <li key={o.key} className={styles.row}>
                  <span className={styles.rowName}>{o.label}<small>arrived {o.on}</small></span><span />
                  <span className={styles.amount}>{eur(o.cents)}</span>
                </li>
              ))}
            </ul>
          ) : <span className={styles.none}>None recorded</span>}
      </Block>
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
  const allCosts = [...(model.halves.web.costs ?? []), ...(model.halves.automation.costs ?? []), ...(model.company.costs ?? [])]
  const ever = model.halves.web.everContracted || model.halves.automation.everContracted

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <h1 className={styles.title}>The Month</h1>
        <nav className={styles.stepper} aria-label="Month">
          <a href={hrefFor(addMonths(M, -1))} aria-label="Previous month">‹</a>
          <span>{monthLabel(M)}</span>
          {/* No next arrow in the month in progress: a disabled control is refused here. */}
          {inProgress ? null : <a href={hrefFor(addMonths(M, 1))} aria-label="Next month">›</a>}
        </nav>
        <span className={styles.phase}>{inProgress ? `Day ${p.day} of ${p.days}` : p.kind === 'closed' ? 'Closed' : 'Not started'}</span>
        <span className={styles.readAt}>Read {at} · net of VAT</span>
      </header>

      {model.neverAnything ? <p className={styles.lede}><b>No contract recorded yet.</b> The beginning, not a fault.</p> : null}

      <section className={styles.sums} aria-label="The company's sums">
        <Block label="Recurring" line={s.composition && ever ? <><i className={styles.keyWeb} />Web {eur(s.composition.web)} · <i className={styles.keyAuto} />Automations {s.composition.automation ? eur(s.composition.automation) : 'none'}</> : 'No contract ever recorded'}>
          {s.recurringCents === null ? <span className={styles.none}>Not shown — a read failed</span>
            : ever ? <Money cents={s.recurringCents} per="/ month" /> : <span className={styles.none}>None recorded</span>}
        </Block>
        <Block label={`One-off${inProgress ? ' so far' : ''}`} line="Never added to recurring">
          {s.oneOffCents === null ? <span className={styles.none}>Not shown — a read failed</span>
            : s.oneOffCents ? <Money cents={s.oneOffCents} /> : <span className={styles.none}>None recorded</span>}
        </Block>
        <Block label={`Costs${inProgress ? ' so far' : ''}`} line="Excludes usage — not measured yet">
          {s.costCents === null ? <span className={styles.none}>Not shown — a read failed</span>
            : allCosts.length ? <Money cents={s.costCents} /> : <span className={styles.none}>None recorded</span>}
        </Block>
        <Block label="Recurring − costs" line={<LeavesLine leaves={s.net} web={false} />}>
          <LeavesFigure leaves={s.net} month={M} />
        </Block>
      </section>

      {model.failed.length ? <Failed thing={`part of ${monthLabel(M)} (${model.failed.join(', ')})`} messages={msgs} /> : null}

      <div className={styles.halves}>
        <HalfView half={model.halves.web} model={model} failures={failures} />
        <HalfView half={model.halves.automation} model={model} failures={failures} />
      </div>
      {!model.clientCostsRecordable ? <p className={styles.footnote}>A single client&rsquo;s own costs are not recordable until migration 0052 is applied.</p> : null}

      <div className={styles.lower}>
        <section className={styles.panel} aria-label="Costs of the company">
          <Block label="Costs of the company" aside="never split between the businesses">
            {model.company.costs === null ? <Failed thing="the company's costs" messages={msgs} /> : <CostRows lines={model.company.costs} />}
          </Block>
        </section>
        {/* Not boxed: two things this page does not have yet, said plainly. */}
        <dl className={styles.pending}>
          <div><dt>Invoices to check</dt><dd>Not built — WhatsApp and model usage are not measured yet.</dd></div>
          <div><dt>What the system did · Firsts</dt><dd>Not built — the next checkpoint.</dd></div>
        </dl>
      </div>

      <details className={styles.absent}>
        <summary>What this page does not do</summary>
        <ul>
          <li>No net for a month in progress.</li>
          <li>No shared cost split between clients or businesses.</li>
          <li>Recurring and one-off never added together.</li>
          <li>No client ranked — listed in order of signing.</li>
          <li>No computed cost shown as checked.</li>
          <li>Not the books: contracted, not invoiced.</li>
        </ul>
      </details>
    </div>
  )
}
