import Link from 'next/link'
import { ClientSwitcher } from '@/components/ClientSwitcher'
import { frameSide, switchTargets, type FrameMode } from '@/lib/frame'
import { badge, type CountsOrUnknown } from '@/lib/counts'
import { switcherClients } from '@/lib/switcher-read'
import { FrameNav } from './FrameNav'
import { FrameTabs } from './FrameTabs'
import styles from './Frame.module.css'

/**
 * The cockpit's one frame. Brief I §0.1 D1/D3, brief II §2.
 *
 * 🔒 IT COUNTS NOTHING. The `counts` prop is read once per request by the
 * layout and handed down. The frame renders a number it was given, and
 * `badge()` is the only formatter, so the sidebar and the page it links to
 * cannot format the same figure differently — the defect that made a nav say 4
 * beside a page saying 5, twice.
 *
 * 🔴 IT HAS NO PRESENTED VARIANT. `frameSide(mode)` decides what is missing,
 * and asking it for a presented render of a screen that refuses presentation
 * throws rather than falling back. Four Stage B screens were each independently
 * drawn with no sidebar at all; one function with a mode is why that cannot
 * happen again.
 */
export async function Frame({
  mode,
  client,
  current,
  counts,
  operatorEmail,
  children,
}: {
  mode: FrameMode
  client?: { id: string; name: string }
  /** The slug of the screen being rendered. '' is a landing. */
  current?: string
  /** Read once, by the layout. Null when the read failed — never zero. */
  counts: CountsOrUnknown
  operatorEmail: string
  children: React.ReactNode
}) {
  const side = frameSide(mode, { client, current })
  const waiting = side.showsCounts ? badge(counts) : ''
  /*
   * 🔒 THE SWITCHER'S LIST IS READ HERE, ONCE, AND NEVER IN PRESENTED MODE.
   * §1.4 is mechanical about it: no other client's name may appear ANYWHERE in
   * the served HTML of a presented screen, options and payloads included. A
   * read that happens and is then filtered out has already put the names in
   * the render; this one does not happen at all.
   */
  const clients = mode === 'presented' ? [] : await switcherClients()
  const targets = switchTargets(clients, { currentClientId: client?.id, currentSlug: current })

  return (
    <div className={styles.app}>
      <aside className={styles.side}>
        <div className={styles.brand}>Ryvo</div>

        {/*
          * 🔴 THE WAY INTO A CLIENT, AT THE TOP LEVEL (22 Sep 2026). frameSide
          * still says the operator frame has no SWITCHER — there is no current
          * client to switch from, and the brief is right about that. What was
          * missing is an OPENER: mapped on 22 Sep, the only doors into a client
          * were two kinds of row on Today, so an agency with nothing waiting
          * and nothing expiring could not be reached by clicking at all.
          */}
        {mode === 'operator' && (
          <ClientSwitcher current={null} targets={targets} openLabel="Open a client" />
        )}

        {side.marker && <span className={styles.marker}>{side.marker}</span>}

        {side.up && (
          <Link className={styles.up} href={side.up.href}>
            <span>‹ {side.up.label}</span>
            {/* An empty badge renders nothing rather than a zero, and a failed
                read renders a dash. Both come from badge(). */}
            {waiting && <span className={styles.upCount}>{waiting} waiting</span>}
          </Link>
        )}

        {side.switcher &&
          (side.switcher.pressable ? (
            /*
             * 🔒 THE ONE ISLAND IN THE CHROME. A menu opens on a click, and the
             * Frame is a server component; until 22 Sep 2026 this was a button
             * with aria-haspopup="menu" and nothing behind it.
             */
            <ClientSwitcher current={side.switcher.name} targets={targets} openLabel="Open a client" />
          ) : (
            // 🔒 Not a disabled button. A greyed control still reads as one
            // click from opening, and what must not exist here is the control
            // itself (§0.4-7).
            <div className={styles.still}>
              <span className={styles.switcherName}>{side.switcher.name}</span>
            </div>
          ))}

        {/*
          * 🔴 The ITEMS are decided here, on the server — presented mode ships
          * one, because §1.4 forbids another screen's name reaching the HTML.
          * Only WHICH IS CURRENT is decided from the live URL, inside FrameNav,
          * because this layout is not re-rendered on a client navigation and a
          * header read once freezes the answer. See components/FrameNav.tsx.
          */}
        <FrameNav
          items={side.items}
          mode={mode}
          label={mode === 'presented' ? 'Esta reunião' : 'Sections'}
          sectionLabel={mode === 'presented' ? 'Esta reunião' : mode === 'client' ? 'This client' : 'Ryvo'}
        />

        <div className={styles.foot}>{operatorEmail} · Europe/Lisbon</div>
      </aside>

      {/* The phone's own element set. Hidden above 900px; the sidebar's nav is
          hidden below 901px. Neither can alter the other. Presented mode gets
          no bar at all, because it has exactly one destination. */}
      {mode !== 'presented' && side.items.length > 1 && (
        <FrameTabs primary={side.items.slice(0, 3)} rest={side.items.slice(3)} mode={mode} />
      )}

      <main className={styles.main}>{children}</main>
    </div>
  )
}
