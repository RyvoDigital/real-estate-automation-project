import Link from 'next/link'
import { IconCalendar, IconChat, IconDoc, IconHome, IconPerson, IconPulse, IconWarning } from './Icons'

/**
 * The sidebar from direction A: a nav column whose selected item is a
 * BRIGHTER tone rather than a coloured one, with the brand gradient
 * appearing only as the 3px indicator. Chrome, so glass is allowed here.
 */
export function Shell({
  children,
  active,
  openCount,
}: {
  children: React.ReactNode
  active: 'overview' | 'escalations' | 'leads' | 'viewings' | 'health' | 'onboarding' | 'report'
  openCount: number
}) {
  const item = (key: typeof active) =>
    `nav__item${active === key ? ' nav__item--on' : ''}`

  return (
    <div className="shell">
      <nav className="nav">
        <div className="nav__brand">
          <div className="nav__mark">R</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: '#fff' }}>
              Ryvo Cockpit
            </div>
          </div>
        </div>

        <Link href="/queue" className={item('escalations')}>
          <IconWarning size={17} />
          <span className="nav__label">Escalations</span>
          {openCount > 0 && <span className="nav__count">{openCount}</span>}
        </Link>

        {/* Not built yet. Shown so the shape of the product is legible, and
            labelled so nothing pretends to work. E3. */}
        <span className="nav__item nav__item--stub" aria-disabled>
          <IconHome size={17} />
          <span className="nav__label">Overview</span>
          <span className="nav__soon">E3</span>
        </span>
        <Link href="/leads" className={item('leads')}>
          <IconPerson size={17} />
          <span className="nav__label">Leads</span>
        </Link>
        <span className="nav__item nav__item--stub" aria-disabled>
          <IconCalendar size={17} />
          <span className="nav__label">Viewings</span>
          <span className="nav__soon">E3</span>
        </span>
        <Link href="/onboarding" className={item('onboarding')}>
          <IconDoc size={17} />
          <span className="nav__label">Onboarding</span>
        </Link>
        <Link href="/health" className={item('health')}>
          <IconPulse size={17} />
          <span className="nav__label">Health</span>
        </Link>
        <Link href="/report" className={item('report')}>
          <IconChat size={17} />
          <span className="nav__label">Weekly report</span>
        </Link>
      </nav>

      <main className="main">{children}</main>
    </div>
  )
}

export function Who({ email }: { email: string }) {
  return (
    <div className="topbar__who">
      <span>{email}</span>
      <form action="/auth/signout" method="post">
        <button className="signout" type="submit">
          Sign out
        </button>
      </form>
    </div>
  )
}
