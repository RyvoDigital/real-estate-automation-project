'use client'

import { useState } from 'react'
import styles from './copy-as-text.module.css'

/**
 * "Copy as text", carried onto the new report screen (22 Sep 2026). It was on
 * the old one (components/Report.tsx) and the reasoning came with it:
 *
 *   🔒 NOTHING IS SENT FROM HERE (§5.7). The cockpit does not deliver the
 *      weekly report; a human reads the numbers, copies them and sends them.
 *      This is the copy, not the send, and it is the reason the screen can be
 *      read in a meeting without a control that could go off by accident.
 *   🔒 IT COPIES THE ARTEFACT, EXACTLY. The text handed over is the same string
 *      the page renders — renderWeekly's own lines. A second formatter here
 *      would drift from what the agency is actually sent, which is the defect
 *      the <pre> exists to prevent.
 *   🔴 IT IS MOUNTED ONLY WHERE THERE IS A DELIVERABLE. A held week has no
 *      control at all, not a greyed one, so this island never renders there.
 *   🔒 A FAILED COPY SAYS SO. The old one reset silently, which looks exactly
 *      like a copy that worked: the clipboard is refused in some browsers and
 *      over plain http, and a button that lies about it is worse than none.
 */
export function CopyAsText({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setState('copied')
            setTimeout(() => setState('idle'), 2500)
          } catch {
            setState('failed')
          }
        }}
      >
        {state === 'copied' ? 'Copied' : 'Copy as text'}
      </button>
      {state === 'failed' && (
        <span className={styles.failed} role="status">
          This browser refused the clipboard, so nothing was copied. Select the document above and copy it.
        </span>
      )}
      <span className={styles.note}>
        Nothing is sent from here. Read the numbers, copy them, and send it yourself.
      </span>
    </div>
  )
}
