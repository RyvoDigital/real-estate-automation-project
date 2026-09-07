import Link from 'next/link'
import { IconChat, IconPerson, IconWarning } from './Icons'
import { MoreSheet } from './MoreSheet'

export type Tab = 'queue' | 'leads' | 'report' | 'more'

/**
 * The app shell.
 *
 * The nav is a FIXED BOTTOM TAB BAR, not a row of links at the top. The old
 * top bar had `flex-shrink: 0` on every item with no wrap and no overflow, so
 * its used width was its max-content — about 755px — and since `.shell` did
 * not clip, that widened <body> on every single screen. Four fixed-width tabs
 * cannot do that.
 *
 * Four destinations, because a labelled icon needs ~80px to be comfortable and
 * 390px does not divide into six of those. Health, Onboarding and Sign out
 * live in the More sheet.
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

  return (
    <div className="shell">
      <main className="main">{children}</main>

      <nav className="tabs" aria-label="Sections">
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
        <MoreSheet active={active === 'more'} email={email} />
      </nav>
    </div>
  )
}
