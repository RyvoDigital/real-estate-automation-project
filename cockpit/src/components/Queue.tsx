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
 * One waiting lead.
 *
 * Three things carry the escalation class, not one: the chip colour, the
 * chip ICON, and — for system faults — a hatch across the card. Colour
 * alone fails in sunlight and fails for a colourblind reader, and this is
 * the §11 item 16 distinction, so it does not get to rest on hue.
 */
export function QueueCard({ row }: { row: QueueRow }) {
  const cls = [
    'card',
    `card--t${row.tier}`,
    row.classes.includes('system') ? 'card--system' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Link href={`/leads/${row.id}`} className={cls}>
      <span className="card__spine" />
      <span className="card__body">
        <span className="card__head">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="age">{formatWait(row.minutes)}</span>
            <span className="tierword">{TIER_WORD[row.tier]}</span>
          </span>
          <span className="card__chips">
            {row.handledElsewhere && <span className="card__elsewhere">Handled elsewhere</span>}
            {row.classes.map((c) => (
              <Chip key={c} kind={c} />
            ))}
          </span>
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="card__who">
            <span className="card__name">{row.name}</span>
            <span className="card__client">{row.clientName}</span>
          </span>

          {/* Every reason, not reasons[0]. A lead that is both high-value
              and booking-failed has two, and showing one hides the other. */}
          {row.reasons.map((r, i) => (
            <span className="reason" key={`${r}-${i}`}>
              {humanise(r)}
            </span>
          ))}

          {row.lastMessage && <span className="card__msg">{row.lastMessage}</span>}
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
        <b>4h breach</b>
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
