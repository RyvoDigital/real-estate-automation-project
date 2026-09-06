import Link from 'next/link'
import { IconCalendar, IconChat, IconHome, IconPerson, IconPulse, IconWarning } from './Icons'

/**
 * The sidebar from direction A: a nav column whose selected item is a
 * BRIGHTER tone rather than a coloured one, with the brand gradient
 * appearing only as the 3px indicator. Chrome, so glass is allowed here.
 */
export function Shell({
  children,
  email,
  active,
  openCount,
}: {
  children: React.ReactNode
  email: string
  active: 'overview' | 'escalations' | 'leads' | 'viewings' | 'health'
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
        <span className="nav__item" aria-disabled>
          <IconHome size={17} />
          <span className="nav__label">Overview</span>
          <span className="nav__soon">E3</span>
        </span>
        <span className="nav__item" aria-disabled>
          <IconPerson size={17} />
          <span className="nav__label">Leads</span>
          <span className="nav__soon">E3</span>
        </span>
        <span className="nav__item" aria-disabled>
          <IconCalendar size={17} />
          <span className="nav__label">Viewings</span>
          <span className="nav__soon">E3</span>
        </span>
        <span className="nav__item" aria-disabled>
          <IconPulse size={17} />
          <span className="nav__label">Health</span>
          <span className="nav__soon">E3</span>
        </span>
        <span className="nav__item" aria-disabled>
          <IconChat size={17} />
          <span className="nav__label">Weekly report</span>
          <span className="nav__soon">E3</span>
        </span>
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
