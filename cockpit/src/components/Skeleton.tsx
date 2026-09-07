import { IconChat, IconMenu, IconPerson, IconWarning } from './Icons'
import type { Tab } from './Shell'

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

      <nav className="tabs" aria-label="Sections">
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
        <span className={cls('more')}>
          <IconMenu size={21} />
          <span>More</span>
        </span>
      </nav>
    </div>
  )
}

/** A block of the right shape, not a spinner — nothing shifts when data lands. */
export function Bar({ w = '100%', h = 14, r = 6 }: { w?: number | string; h?: number; r?: number }) {
  return <span className="skeleton" style={{ display: 'block', width: w, height: h, borderRadius: r }} />
}
