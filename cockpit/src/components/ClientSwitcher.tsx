'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { SwitchTarget } from '@/lib/frame'
import styles from './ClientSwitcher.module.css'

/**
 * THE CLIENT SWITCHER (brief §1.3; built 22 Sep 2026).
 *
 * Until today the chrome rendered `<button aria-haspopup="menu">` with the
 * client's name and NOTHING behind it — a control that advertised a menu and
 * opened nothing, which no test caught because the test asserted the data said
 * `pressable: true`. This is the menu.
 *
 *   🔒 A CONTROL IN THE CHROME, NEVER A PAGE (§1.3). The island is this button
 *      and its list; the Frame around it stays a server component.
 *   🔒 THE SAME SCREEN, THE OTHER AGENCY. Where that cannot be honoured —
 *      a form is open, or the URL names one of this client's records — it says
 *      so on the row rather than landing somewhere unexplained.
 *   🔒 NOT STICKY. Nothing is remembered: a remembered client is a screen that
 *      looks current and is about somebody else (§1.3).
 *   🔒 EVERY DESTINATION IS A REAL LINK, so it opens in a new tab, and works
 *      before this component has hydrated.
 */
export function ClientSwitcher({ current, targets, openLabel, defaultOpen = false }: {
  /** The client whose screens these are, or null at the operator level. */
  current: string | null
  targets: SwitchTarget[]
  /** What the control says when there is no current client. */
  openLabel: string
  /**
   * 🔒 FOR THE PREVIEW ONLY (tests/render-switcher-preview.tsx). A static
   * render has no JavaScript, so a menu that opens on a click cannot be
   * screenshotted shut. The frame never passes this, and tests/switcher.test.ts
   * asserts the call it does make.
   */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  return (
    <div className={styles.wrap} ref={box}>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.name}>{current ?? openLabel}</span>
        <span className={styles.chev} aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {current && <p className={styles.here}>You are on {current}.</p>}
          {targets.length === 0 ? (
            // 🔴 Never an empty box: it says why there is nothing to switch to.
            <p className={styles.none}>
              {current ? 'There is no other agency yet.' : 'No agency has been taken on yet.'}
            </p>
          ) : (
            <ul className={styles.list}>
              {targets.map((t) => (
                <li key={t.id}>
                  <Link className={styles.item} href={t.href} role="menuitem" onClick={() => setOpen(false)}>
                    <span className={styles.itemName}>{t.name}</span>
                    {/* 🔒 The reason travels with the row, not as a footnote. */}
                    {t.why && <span className={styles.why}>{t.why}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/*
            * 🔒 THE WAY TO THE WHOLE LIST. The menu answers "which client?" and
            * hands off; it is not the place to read how everyone is doing, and
            * a menu that grew columns would become that screen badly.
            */}
          <Link className={styles.all} href="/clients" role="menuitem" onClick={() => setOpen(false)}>
            See all clients
          </Link>
        </div>
      )}
    </div>
  )
}
