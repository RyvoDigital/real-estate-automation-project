import Link from 'next/link'
import {
  CLASS_LABEL,
  TIER_WORD,
  formatWait,
  humanise,
  type EscalationClass,
  type Tier,
} from '@/lib/escalation'
import type { QueueRow } from '@/lib/data'
import { IconPerson, IconStar, IconWarning } from './Icons'

export function Chip({ kind }: { kind: EscalationClass }) {
  const Icon = kind === 'system' ? IconWarning : kind === 'high_value' ? IconStar : IconPerson
  return (
    <span className={`chip chip--${kind}`}>
      <Icon size={12} />
      {CLASS_LABEL[kind]}
    </span>
  )
}

/**
 * The longest-waiting lead, given the whole width.
 *
 * A triage screen's first job is to answer "who first" without a tap, so the
 * one at the top gets the age at 54px, the reason in words, what they actually
 * said, and the route to the reply. Everything behind it is a row.
 *
 * The whole card is the link — including the button-shaped element. It is a
 * span, not a button, because it does exactly what a tap anywhere on the card
 * does: open the lead. Behaviour is unchanged from the old QueueCard.
 */
export function QueueHero({ row }: { row: QueueRow }) {
  const cls = ['hero', `hero--t${row.tier}`, row.classes.includes('system') ? 'hero--system' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <Link href={`/leads/${row.id}`} className={cls}>
      <span className="hero__top">
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="hero__word">{TIER_WORD[row.tier]}</span>
          <span className="hero__age">{formatWait(row.minutes)}</span>
        </span>
        <span className="chips-wrap" style={{ justifyContent: 'flex-end' }}>
          {row.handledElsewhere && <span className="chip chip--elsewhere">Handled elsewhere</span>}
          {row.classes.map((c) => (
            <Chip key={c} kind={c} />
          ))}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span className="hero__name">{row.name}</span>
        <span className="hero__meta">{row.clientName}</span>
        {/* Every reason, not reasons[0]. A lead that is both high-value and
            booking-failed has two, and showing one hides the other. */}
        {row.reasons.map((r, i) => (
          <span className="hero__meta" key={`${r}-${i}`}>
            {humanise(r)}
          </span>
        ))}
      </span>

      {row.lastMessage && <span className="hero__quote">{row.lastMessage}</span>}

      <span className="hero__actions">
        <span className="btn btn--primary">Reply</span>
      </span>
    </Link>
  )
}

/**
 * One lead behind the hero.
 *
 * Three things carry the escalation class, not one: the mark's colour, the
 * mark's ICON, and — for system faults — a hatch across the row. Colour alone
 * fails in sunlight and fails for a colourblind reader, and this is the §11
 * item 16 distinction, so it does not get to rest on hue.
 */
export function QueueRowItem({ row }: { row: QueueRow }) {
  const Icon =
    row.primary === 'system' ? IconWarning : row.primary === 'high_value' ? IconStar : IconPerson
  const cls = ['row', `row--t${row.tier}`, row.classes.includes('system') ? 'row--system' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <Link href={`/leads/${row.id}`} className={cls}>
      <span className="row__spine" />
      <span className="row__body">
        <span className="row__name">{row.name}</span>
        <span className="row__why">
          {row.reasons.length ? humanise(row.reasons[0]) : CLASS_LABEL[row.primary]}
          {row.reasons.length > 1 ? ` +${row.reasons.length - 1}` : ''}
        </span>
      </span>
      <span className="row__end">
        <span className="row__age">{formatWait(row.minutes)}</span>
        <span className={`row__mark chip--${row.primary}`}>
          <Icon size={12} />
        </span>
      </span>
    </Link>
  )
}

export function PressureBar({ rows }: { rows: { minutes: number; primary: EscalationClass }[] }) {
  const colour = (k: EscalationClass, minutes: number) => {
    if (k === 'high_value') return 'var(--bone)'
    if (minutes >= 240) return '#ff4438'
    if (minutes >= 90) return 'var(--t2)'
    if (minutes >= 30) return 'var(--t1)'
    return 'var(--t0)'
  }

  return (
    <div className="pressure">
      <div className="pressure__track">
        <span className="pressure__breach" />
        {rows.map((r, i) => (
          <span
            key={i}
            className="pressure__mark"
            style={{
              left: `${Math.min(r.minutes / 300, 1) * 96}%`,
              width: r.minutes >= 240 ? 5 : 3,
              background: colour(r.primary, r.minutes),
            }}
          />
        ))}
      </div>
      <div className="pressure__axis">
        <span>now</span>
        <span>1h</span>
        <span>2h</span>
        <span>3h</span>
        <b>4h</b>
      </div>
    </div>
  )
}

/**
 * A cluster of system escalations in a short window is an outage, and it is
 * a different fact from a busy day. Pinned ABOVE the list because a fresh
 * outage produces the newest rows, which sort last under longest-waiting-
 * first — the banner preserves the ordering instead of fighting it.
 */
export function OutageBanner({ count, reason }: { count: number; reason: string }) {
  return (
    <div className="outage" role="alert">
      <IconWarning size={20} />
      <div>
        <h2>The assistant is down</h2>
        <p>
          {count} leads escalated by <code>{reason}</code> in the last fifteen minutes. That is an
          outage, not demand.
        </p>
      </div>
    </div>
  )
}

export function tierOf(minutes: number): Tier {
  return minutes >= 240 ? 3 : minutes >= 90 ? 2 : minutes >= 30 ? 1 : 0
}
