import Link from 'next/link'
import { IconChat, IconDoc, IconPerson, IconPulse, IconSignOut, IconWarning } from './Icons'
import { MoreSheet } from './MoreSheet'

export type Tab = 'queue' | 'leads' | 'report' | 'health' | 'onboarding'

/** Health and Onboarding live behind More on a phone; on desktop they do not. */
export const BEHIND_MORE: Tab[] = ['health', 'onboarding']

/**
 * The app shell.
 *
 * ON A PHONE this is a FIXED BOTTOM TAB BAR, not a row of links at the top.
 * The old top bar had `flex-shrink: 0` on every item with no wrap and no
 * overflow, so its used width was its max-content — about 755px — and since
 * `.shell` did not clip, that widened <body> on every screen. Four fixed-width
 * tabs cannot do that. Four, because a labelled icon needs ~80px to be
 * comfortable and 390px does not divide into six of those, so Health,
 * Onboarding and Sign out sit behind More.
 *
 * ON DESKTOP THERE IS NO SUCH BUDGET, so the sidebar is fully expanded and the
 * More button and its sheet are gone. That is done with two element sets
 * rather than one that changes shape:
 *
 *   .tab     the three primary destinations — identical in both layouts
 *   .dtab    Health, Onboarding, Sign out — `display: none` below 901px, and
 *            styled ONLY inside the desktop media query
 *
 * so nothing about the phone can be altered by a desktop rule, by construction.
 * The `active` value is precise ('health', not 'more'); the More button lights
 * up for anything behind it and is hidden on desktop, the expanded rows light
 * up for themselves and are hidden on the phone, and the two never both show.
 */
export function Shell({
  children,
  active,
  openCount,
  email,
}: {
  children: React.ReactNode
  active: Tab
  openCount: number
  email: string
}) {
  const cls = (t: Tab) => `tab${active === t ? ' tab--on' : ''}`
  const dcls = (t: Tab) => `dtab${active === t ? ' dtab--on' : ''}`

  return (
    <div className="shell">
      <main className="main">{children}</main>

      <nav className="tabs" aria-label="Sections">
        <span className="tabs__brand" aria-hidden>
          <span className="tabs__mark">R</span>
          Ryvo Cockpit
        </span>

        <Link href="/queue" className={cls('queue')} aria-current={active === 'queue'}>
          <IconWarning size={21} />
          <span>Queue</span>
          {openCount > 0 && <span className="tab__badge">{openCount}</span>}
        </Link>
        <Link href="/leads" className={cls('leads')} aria-current={active === 'leads'}>
          <IconPerson size={21} />
          <span>Leads</span>
        </Link>
        <Link href="/report" className={cls('report')} aria-current={active === 'report'}>
          <IconChat size={21} />
          <span>Report</span>
        </Link>

        {/* Phone only. Hidden on desktop, where everything it holds is below. */}
        <MoreSheet active={BEHIND_MORE.includes(active)} email={email} />

        {/* Desktop only. Absent from the phone layout, not rearranged into it. */}
        <span className="dtab__rule" aria-hidden />

        <Link href="/health" className={dcls('health')} aria-current={active === 'health'}>
          <IconPulse size={19} />
          <span className="dtab__text">
            Health
            <span className="dtab__meta">Twelve checks</span>
          </span>
        </Link>
        <Link href="/onboarding" className={dcls('onboarding')} aria-current={active === 'onboarding'}>
          <IconDoc size={19} />
          <span className="dtab__text">
            Onboarding
            <span className="dtab__meta">New client</span>
          </span>
        </Link>

        <form action="/auth/signout" method="post" className="dtab__foot">
          <button type="submit" className="dtab dtab--quiet">
            <IconSignOut size={19} />
            <span className="dtab__text">
              Sign out
              <span className="dtab__meta wrap-any">{email}</span>
            </span>
          </button>
        </form>
      </nav>
    </div>
  )
}
