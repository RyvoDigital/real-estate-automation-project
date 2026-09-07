import { IconChat, IconDoc, IconMenu, IconPerson, IconPulse, IconWarning } from './Icons'
import { BEHIND_MORE, type Tab } from './Shell'

/**
 * The shell of a screen that has no data yet.
 *
 * WHY EVERY ROUTE NEEDS ONE. Without a loading.tsx, Next.js sends nothing at
 * all until the whole server render finishes — first byte and last byte arrive
 * together. Measured on /leads that was 500ms locally and up to 1.0s in
 * production, during which a tap did nothing whatsoever. That dead interval is
 * what "the transitions feel laggy" actually is; /queue felt fine only because
 * it was the one route with a skeleton, flushing its first byte in 11ms.
 *
 * So this is not decoration and it is not an animation. It is the difference
 * between a tap that responds now and a tap that responds in a second.
 *
 * The tab bar is real markup rather than placeholders: it needs no data, so it
 * paints on the first frame and the chrome never flickers between screens.
 */
export function SkeletonShell({
  active,
  eyebrow,
  title,
  note,
  children,
}: {
  active: Tab
  eyebrow: string
  title: string
  note: string
  children: React.ReactNode
}) {
  const cls = (t: Tab) => `tab${active === t ? ' tab--on' : ''}`
  const dcls = (t: Tab) => `dtab${active === t ? ' dtab--on' : ''}`

  return (
    <div className="shell">
      <main className="main" aria-busy="true" aria-live="polite">
        <header className="head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="head__title">{title}</h1>
          </div>
        </header>
        {children}
        <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>{note}</span>
      </main>

      {/* Identical markup to Shell's nav, so the chrome does not shift or
          flicker between the skeleton and the real screen. */}
      <nav className="tabs" aria-label="Sections">
        <span className="tabs__brand" aria-hidden>
          <span className="tabs__mark">R</span>
          Ryvo Cockpit
        </span>

        <span className={cls('queue')}>
          <IconWarning size={21} />
          <span>Queue</span>
        </span>
        <span className={cls('leads')}>
          <IconPerson size={21} />
          <span>Leads</span>
        </span>
        <span className={cls('report')}>
          <IconChat size={21} />
          <span>Report</span>
        </span>
        <span className={`tab tab--more${BEHIND_MORE.includes(active) ? ' tab--on' : ''}`}>
          <IconMenu size={21} />
          <span>More</span>
        </span>

        <span className="dtab__rule" aria-hidden />

        <span className={dcls('health')}>
          <IconPulse size={19} />
          <span className="dtab__text">
            Health
            <span className="dtab__meta">Twelve checks</span>
          </span>
        </span>
        <span className={dcls('onboarding')}>
          <IconDoc size={19} />
          <span className="dtab__text">
            Onboarding
            <span className="dtab__meta">New client</span>
          </span>
        </span>
      </nav>
    </div>
  )
}

/** A block of the right shape, not a spinner — nothing shifts when data lands. */
export function Bar({ w = '100%', h = 14, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return <span className="skeleton" style={{ display: 'block', width: w, height: h, borderRadius: r }} />
}
