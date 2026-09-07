'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconDoc, IconMenu, IconPulse, IconSignOut } from './Icons'

/**
 * The fourth tab. Health and Onboarding are real work but not daily work — a
 * permanent tab each would cost the other three the room they need to stay
 * above 44px on a 390px screen.
 */
export function MoreSheet({ active, email }: { active: boolean; email: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={`tab${active ? ' tab--on' : ''}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <IconMenu size={21} />
        <span>More</span>
      </button>

      {open && (
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label="More"
          onClick={() => setOpen(false)}
        >
          <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
            <span className="sheet__grab" />

            <Link href="/health" className="sheet__item" onClick={() => setOpen(false)}>
              <IconPulse size={19} />
              Health
              <span className="sheet__meta">Twelve checks</span>
            </Link>

            <Link href="/onboarding" className="sheet__item" onClick={() => setOpen(false)}>
              <IconDoc size={19} />
              Onboarding
              <span className="sheet__meta">New client</span>
            </Link>

            <form action="/auth/signout" method="post">
              <button type="submit" className="sheet__item" style={{ width: '100%' }}>
                <IconSignOut size={19} />
                Sign out
                <span className="sheet__meta wrap-any">{email}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
