'use client'

import { useState, useTransition } from 'react'
import { handBackToAI, sendReply, type ActionResult } from '@/lib/actions'
import { IconWarning } from './Icons'

/**
 * The reply composer.
 *
 * The result of a send is stated in words and never inferred from the
 * button having been pressed. A failed send says "Not sent", keeps the text
 * in the box so nothing is lost, and does not clear anything — §11 item 6,
 * the one failure in this project that reached a prospect.
 */
export function Composer({ leadId, firstName }: { leadId: string; firstName: string }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  const submit = () => {
    if (!text.trim() || pending) return
    setResult(null)
    start(async () => {
      const r = await sendReply(leadId, text)
      setResult(r)
      // Only clear the box on a confirmed send. If it failed, the words the
      // operator wrote are the last thing that should be thrown away.
      if (r.ok) setText('')
    })
  }

  return (
    <div className="composer">
      {result && (
        <div className={`notice notice--${result.ok ? 'ok' : 'bad'}`} role="status">
          {!result.ok && <IconWarning size={14} />} {result.message}
        </div>
      )}
      <div className="composer__row">
        <textarea
          className="composer__field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Reply to ${firstName}…`}
          rows={2}
          maxLength={1500}
          disabled={pending}
          aria-label="Reply text"
        />
        <button
          className="composer__send"
          onClick={submit}
          disabled={pending || !text.trim()}
          type="button"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
      <span className="composer__hint">
        Sends through the same WhatsApp path the assistant uses, and is recorded in the
        conversation. {text.length > 1200 ? `${1500 - text.length} characters left.` : ''}
      </span>
    </div>
  )
}

/**
 * Hand back to the AI. Explicit and confirmed, never automatic (§5.3) — the
 * default is that the lead stays with the human, so the confirm step is the
 * feature, not friction.
 */
export function HandBack({ leadId }: { leadId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  if (result?.ok) {
    return <span className="handback__done">{result.message}</span>
  }

  return (
    <div className="handback">
      {result && !result.ok && (
        <div className="notice notice--bad" role="status">
          <IconWarning size={14} /> {result.message}
        </div>
      )}

      {!confirming ? (
        <button className="btn-ghost" type="button" onClick={() => setConfirming(true)}>
          Hand back to the AI
        </button>
      ) : (
        <div className="handback__confirm">
          <span>
            The assistant will answer this lead&rsquo;s next message. It will not know what was
            discussed anywhere but here.
          </span>
          <div className="handback__actions">
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              className="btn-solid"
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setResult(await handBackToAI(leadId))
                  setConfirming(false)
                })
              }
            >
              {pending ? 'Handing back…' : 'Yes, hand back'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
