'use client'

import { useState, useTransition } from 'react'
import { draftReply, handBackToAI, sendReply, type ActionResult, type DraftResult } from '@/lib/actions'
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
  const [draft, setDraft] = useState<DraftResult | null>(null)
  const [pending, start] = useTransition()

  /**
   * A draft is unmistakable, and it stops being a draft the moment it is
   * touched. §7 and §11 item 13: it must never be possible to confuse an
   * unreviewed suggestion with something already sent — the same failure as
   * instance 6 in a different costume.
   *
   * So the banner is tied to the text being UNCHANGED. Edit one character
   * and the "this is a draft" marker disappears, because from then on the
   * words are yours.
   */
  const isUntouchedDraft = draft !== null && draft.ok && text === draft.draft

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
      {isUntouchedDraft && draft && (
        <div className="draftmark" role="status">
          <span className="draftmark__tag">Draft — not sent</span>
          <span className="draftmark__body">
            {draft.source === 'fixed'
              ? 'Written by your client’s own handoff note, not by the assistant.'
              : `Suggested by the assistant in ${draft.language}. Read every word.`}
            {draft.note ? ` ${draft.note}` : ''}
          </span>
        </div>
      )}

      <textarea
        className="composer__field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Reply to ${firstName}…`}
        rows={3}
        maxLength={1500}
        disabled={pending}
        aria-label="Reply text"
      />
      <div className="composer__actions">
        <button
          className="btn btn--ghost"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setResult(null)
              const d = await draftReply(leadId)
              setDraft(d)
              if (d.ok) setText(d.draft)
              else setResult({ ok: false, message: d.message })
            })
          }
        >
          {pending ? '…' : 'Draft it'}
        </button>
        <button
          className={`btn btn--primary${isUntouchedDraft ? ' btn--draft' : ''}`}
          onClick={submit}
          disabled={pending || !text.trim()}
          type="button"
        >
          {pending ? 'Sending…' : isUntouchedDraft ? 'Send this draft' : 'Send'}
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
        <button className="btn btn--ghost" type="button" onClick={() => setConfirming(true)}>
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
              className="btn btn--ghost"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
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
