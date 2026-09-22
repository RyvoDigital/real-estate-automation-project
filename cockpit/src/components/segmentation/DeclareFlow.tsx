'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { declareGroupAction } from '@/lib/segmentation/actions'
import { UI, SEGMENT_CHOICE } from '@/lib/segmentation/copy'
import { SURFACE } from '@/lib/segmentation/surface'
import type { Step2View } from '@/lib/segmentation/present'
import type { Segment } from '@/lib/segmentation/declare-types'
import styles from './segmentation.module.css'

/**
 * One group's declaration, both steps. /segmentation checkpoint 2 (22 Sep 2026).
 *
 *   step 1   where did these contacts come from?        (origin)
 *   step 2   given that answer, what is still needed?   (evidence, scoped)
 *
 * 🔒 THE ANSWER LIVES IN THIS FORM'S OWN STATE, NEVER IN THE URL (operator,
 * 22 Sep 2026). Step 1 used to be a GET form carrying `?origem=` — so a
 * bookmarked or shared link opened step 2 with an origin nobody had chosen in
 * that session. A link may reopen the GROUP (`?grupo=`); only a click here
 * chooses the answer, and a reload forgets it.
 *
 * 🔒 NOTHING IS PRE-SELECTED: not the origin, not whether they are sure. Each is
 * a pair or a set of radios with no default, and the core refuses an unanswered
 * one (declare-core.ts), so the screen cannot supply what the person did not.
 *
 * 🔒 THE DECLARATION ID CAME WITH THE PAGE (`declarationId`, minted when it was
 * drawn). Submitting this form twice sends the same id, and 0055 records it once.
 *
 * Colour comes only from the SURFACE pairs (surface.ts: background, text and
 * the browser's control scheme, decided together and contrast-tested); the
 * module carries layout, type and spacing, and derives its hairlines from the
 * text colour it sits on.
 */

// Secondary text always names the surface it sits on.
const muted = { color: SURFACE.page.muted }
// The field is a surface too: without this the browser paints it for dark mode.
const field = { ...SURFACE.page }
const mutedOnNote = { color: SURFACE.note.muted }
const noteBox = { ...SURFACE.note }

export function DeclareFlow({ clientId, group, contacts, declarationId, views }: {
  clientId: string
  group: { id: string; label: string }
  contacts: { id: string; name: string; phone: string; state: string; fromFile: string | null }[]
  declarationId: string
  /** step 2 for each answer, composed on the server by present.ts (the page and the probe compose it once) */
  views: Record<Segment, Step2View>
}) {
  const [segment, setSegment] = useState<Segment | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [prompt, setPrompt] = useState(false)

  return step === 1 || !segment ? (
    <Step1
      chosen={segment}
      prompt={prompt}
      views={views}
      onChoose={(s) => { setSegment(s); setPrompt(false) }}
      onContinue={() => (segment ? setStep(2) : setPrompt(true))}
    />
  ) : (
    <Step2
      clientId={clientId} group={group} contacts={contacts} declarationId={declarationId}
      segment={segment} view={views[segment]} onChange={() => setStep(1)}
    />
  )
}

/** Step 1: one question, four answers, nothing else. */
export function Step1({ chosen, prompt, views, onChoose, onContinue }: {
  chosen: Segment | null
  prompt: boolean
  views: Record<Segment, Step2View>
  onChoose: (s: Segment) => void
  onContinue: () => void
}) {
  return (
    <div className={styles.step}>
      <fieldset className={styles.choices}>
        <legend className={styles.question}>{UI.segmentLegend}</legend>
        {(['A', 'B', 'C', 'D'] as const).map((seg) => (
          // Each answer is its own bordered block: read aloud, four labels and
          // four consequences with only a line break between them ran together.
          <label key={seg} className={styles.option}>
            {/* No pre-selection: a pre-ticked option collects a click rather
                than a decision, and the click carries the weight of a
                declaration (§11d). `checked` is this session's own click. */}
            <input
              type="radio" name="origem" value={seg}
              checked={chosen === seg} onChange={() => onChoose(seg)}
            />
            <span>
              <b>{SEGMENT_CHOICE[seg].label}</b>
              <span style={muted}>{views[seg].consequence}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onContinue}>{UI.continueToDetail}</button>
        {prompt && <span role="alert" className={styles.prompt}>{UI.chooseFirst}</span>}
      </div>
    </div>
  )
}

/** Step 2: what that answer still needs, and nothing it does not. */
export function Step2({ clientId, group, contacts, declarationId, segment, view, onChange }: {
  clientId: string
  group: { id: string; label: string }
  contacts: { id: string; name: string; phone: string; state: string; fromFile: string | null }[]
  declarationId: string
  segment: Segment
  view: Step2View
  onChange: () => void
}) {
  return (
    <form action={declareGroupAction} className={styles.step}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="declarationId" value={declarationId} />
      <input type="hidden" name="segment" value={segment} />
      {contacts.map((c) => <input key={c.id} type="hidden" name="contact" value={c.id} />)}

      <div className={styles.said}>
        <p className={styles.saidLine}>{view.youSaid}</p>
        <p className={styles.line} style={muted}>{view.consequence}</p>
        {/* The escape hatch. If they realise they answered wrong, this is the
            control they need, so it is never the faintest thing on the screen:
            body size, the surface's own text colour. */}
        <button type="button" className={styles.hatch} onClick={onChange}
          style={{ color: SURFACE.page.color, fontSize: 16 }}>
          {UI.changeAnswer}
        </button>
      </div>

      {/* The file note comes AFTER the origin, and only when this group's file
          actually claimed something. It is an admission, so it belongs to the
          question it explains rather than to the opening of a meeting. */}
      {view.note && (
        <div className={styles.note} style={noteBox}>
          <strong>{view.note.heading}</strong>
          <p>{view.note.body}</p>
          <p>{view.note.scope}</p>
          {view.note.extra && <p style={mutedOnNote}>{view.note.extra}</p>}
          <p style={mutedOnNote}>{view.note.count}</p>
        </div>
      )}

      {/* B is the only answer that claims evidence exists, and the only one asked for it. */}
      {view.ask.kind === 'basis' ? (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{view.ask.question}</span>
          <span className={styles.hint} style={muted}>{view.ask.hint}</span>
          <input name="basis" required className={styles.input} style={field} />
        </label>
      ) : (
        <p className={styles.line} style={muted}>{view.ask.text}</p>
      )}

      {/* Directly under the answer it qualifies. Two answers, neither chosen:
          "sure" is something the person says, never something the screen assumes. */}
      <fieldset className={styles.pair}>
        <legend className={styles.fieldLabel}>{UI.sureLegend}</legend>
        <label className={styles.option}>
          <input type="radio" name="uncertainty" value="sure" required />
          <span><b>{UI.sure}</b></span>
        </label>
        <label className={styles.option}>
          <input type="radio" name="uncertainty" value="unsure" required />
          <span><b>{UI.unsure}</b></span>
        </label>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{UI.whoIsDeclaring}</span>
        <span className={styles.hint} style={muted}>{UI.whoIsDeclaringHint}</span>
        <input name="declaredBy" required className={styles.input} style={field} />
      </label>

      <details className={styles.except}>
        <summary>{UI.exceptions}</summary>
        <ul>
          {contacts.map((c) => (
            <li key={c.id}>
              <label className={styles.check}>
                <input type="checkbox" name="exclude" value={c.id} />
                <span>
                  {c.name} · {c.phone}
                  <span style={muted}> · {c.state}</span>
                  {c.fromFile && <span style={muted}> · {c.fromFile}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>

      <div className={styles.actions}>
        <Submit />
      </div>
    </form>
  )
}

/** Disabled only while its own save is in flight, so a double click cannot become two requests. */
function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={styles.primary} disabled={pending} aria-busy={pending}>
      {UI.confirm}
    </button>
  )
}
