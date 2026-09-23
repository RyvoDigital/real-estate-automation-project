'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { slugForPath, type FrameMode } from '@/lib/frame'
import styles from './Frame.module.css'

/**
 * THE SIDEBAR'S DESTINATIONS, AND WHICH ONE YOU ARE ON (23 Sep 2026).
 *
 * 🔴 WHY THE HIGHLIGHT IS DECIDED HERE AND NOT ON THE SERVER.
 *
 * Until now the frame was told which item was current by a request header the
 * proxy set, read with `headers()` in the layout. That worked while every page
 * rendered its own frame, because every navigation re-rendered the layout too.
 *
 * Moving the frame into a layout is exactly what broke it. **A layout is not
 * re-rendered on a client navigation** — that is the whole point of it, and it
 * is why the chrome now persists instead of blinking. So `headers()` is read
 * ONCE, on the first render of the session, and the answer freezes there. The
 * operator reported it as "the highlight is stuck on Clients": Clients was
 * simply the first screen they opened. The nav was not slow or wrong, it was
 * answering a question asked once and never again.
 *
 * The same was true of the CLIENT frame before any of this work, and nobody
 * had noticed: moving between two screens of one client keeps the layout, so
 * the highlight stayed on whichever screen was opened first.
 *
 * 🔒 So the ITEMS stay server-rendered — `frameSide(mode)` decides what the
 * sidebar contains, and in presented mode that is one item, because §1.4 says
 * no other screen's name may reach the served HTML. Only WHICH ONE IS CURRENT
 * is decided here, from the live URL, which is the only thing that actually
 * changes on a navigation.
 *
 * 🔒 The links are real `<Link>`s and every destination still works with no
 * JavaScript; what needs JavaScript is the bold.
 */
export function FrameNav({
  items,
  mode,
  label,
  sectionLabel,
}: {
  items: { slug: string; label: string; href: string; built: boolean }[]
  mode: FrameMode
  /** The nav's accessible name. */
  label: string
  /** The word above the list. */
  sectionLabel: string
}) {
  const current = slugForPath(usePathname() ?? '', mode)

  return (
    <nav className={styles.nav} aria-label={label}>
      <span className={styles.navLabel}>{sectionLabel}</span>
      {items.map((item) =>
        item.built ? (
          <Link
            key={item.slug}
            className={styles.item}
            href={item.href}
            aria-current={item.slug === current ? 'page' : undefined}
          >
            <span>{item.label}</span>
          </Link>
        ) : (
          /*
           * 🔒 NOT A DISABLED LINK. §0.4-7: a greyed control still reads as one
           * click from opening, and this one would open a 404. There is nothing
           * to open, so there is no control — and the word says which of the two
           * states it is, because "not built yet" and "broken" look identical
           * from a dead link and only one of them is worth reporting.
           */
          <span key={item.slug} className={styles.unbuilt}>
            <span>{item.label}</span>
            <span className={styles.unbuiltWord}>not built</span>
          </span>
        ),
      )}
    </nav>
  )
}
