'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { slugForPath, type FrameMode } from '@/lib/frame'
import styles from './FrameTabs.module.css'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PHONE FRAME — A FIXED BOTTOM BAR, AND THE HISTORY IS THE ARGUMENT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This deliberately repeats the shape of the existing Shell rather than
 * starting clean, because that shape was argued from a defect that shipped
 * twice:
 *
 *   "The old top bar had flex-shrink: 0 on every item with no wrap and no
 *    overflow, so its used width was its max-content — about 755px — and since
 *    .shell did not clip, that widened <body> on every screen."
 *
 * 🔒 SO: FOUR FIXED-WIDTH TABS, AND TWO ELEMENT SETS RATHER THAN ONE THAT
 * CHANGES SHAPE. The sidebar is `display: none` below 901px and the bar is
 * `display: none` above 900px, so nothing about the phone can be altered by a
 * desktop rule, by construction. A single element that reflows is exactly how
 * the first two versions broke.
 *
 * Four, because a labelled tap target needs about 80px to stay comfortable and
 * 390px does not divide into six of those. The client frame has fifteen
 * destinations; eleven of them live behind More, which is the same trade the
 * operator frame already makes for Health and Onboarding.
 */

export type Tab = { slug: string; label: string; href: string }

export function FrameTabs({ primary, rest, mode }: { primary: Tab[]; rest: Tab[]; mode: FrameMode }) {
  /*
   * 🔴 FROM THE LIVE URL, not from a prop. This took `current` from the Frame,
   * which took it from a header read in a layout — and a layout is not
   * re-rendered on a client navigation, so the answer froze on the first screen
   * of the session. The sidebar had the same bug; see components/FrameNav.tsx.
   */
  const current = slugForPath(usePathname() ?? '', mode)
  const [open, setOpen] = useState(false)
  const inRest = rest.some((t) => t.slug === current)

  return (
    <>
      <nav className={styles.tabs} aria-label="Sections">
        {primary.map((t) => (
          <Link
            key={t.slug}
            href={t.href}
            className={`${styles.tab} ${t.slug === current ? styles.on : ''}`}
            aria-current={t.slug === current ? 'page' : undefined}
          >
            <span>{t.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`${styles.tab} ${inRest ? styles.on : ''}`}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span>More</span>
        </button>
      </nav>

      {open && (
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="More sections">
          <button type="button" className={styles.scrim} onClick={() => setOpen(false)} aria-label="Close" />
          <div className={styles.sheetBody}>
            {rest.map((t) => (
              <Link
                key={t.slug}
                href={t.href}
                className={styles.sheetItem}
                aria-current={t.slug === current ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
