'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveCalibrationAction } from '@/lib/matching/calibrate-actions'
import { parseAnswers, type CalibrationForm } from '@/lib/matching/calibrate-core'
import { problemsWith, type Answers } from '@/lib/matching/thresholds'
import { CALIBRATE } from '@/lib/matching/screen-copy'
import { SURFACE } from '@/lib/segmentation/surface'
import styles from './calibrate.module.css'

/**
 * The calibration conversation's form (checkpoint 2, 22 Sep 2026).
 *
 * 🔒 EVERY FIELD STARTS EMPTY, every time. Each sitting is its own record
 * (0056), so a field carrying last time's answer would collect a click and
 * record it as today's judgement. What was said last time is shown BESIDE each
 * field (`reference`), read-only, with the sitting's date and who answered on
 * the page above.
 *
 * 🔒 A missing or contradictory answer is caught HERE, before anything is sent,
 * using the same problemsWith() the server runs: so what the agent typed is not
 * lost to a round trip. The server refuses the same things again, and is the
 * guarantee; this is the courtesy.
 *
 * Colours come only from the SURFACE pairs (lib/segmentation/surface.ts, the
 * contrast-tested light surface this screen shares with /segmentation).
 */

type Field = keyof Answers | 'answeredBy'

const field = { ...SURFACE.page }
const muted = { color: SURFACE.page.muted }

export function CalibrateForm({ clientId, calibrationId, reference, serverProblems }: {
  clientId: string
  /** minted when the page was drawn: the same form sent twice is one sitting (0056) */
  calibrationId: string
  /** the previous sitting's answers, as text, per field; null = no previous sitting */
  reference: Record<keyof Answers, string> | null
  /** the fields the server refused, after a round trip that got past this check */
  serverProblems: Partial<Record<Field, string>>
}) {
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>(serverProblems)

  function check(e: React.FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget)
    const t = (k: string) => { const v = f.get(k); return typeof v === 'string' ? v : null }
    const form: CalibrationForm = {
      calibrationId, clientId, answeredBy: t('answeredBy'),
      budgetSaid: t('budgetSaid'), budgetMost: t('budgetMost'), budgetStretchMost: t('budgetStretchMost'),
      showsOneFewerBedroom: t('showsOneFewerBedroom'), ofHowMany: t('ofHowMany'),
      strongAtLeast: t('strongAtLeast'), possibleAtLeast: t('possibleAtLeast'), adjacency: t('adjacency'),
    }
    const found: Partial<Record<Field, string>> = {}
    if (!(form.answeredBy ?? '').trim()) found.answeredBy = 'missing'
    for (const p of problemsWith(parseAnswers(form))) found[p.field] ??= p.why
    setProblems(found)
    if (Object.keys(found).length > 0) e.preventDefault()
  }

  const Problem = ({ f }: { f: Field }) =>
    problems[f] ? <span role="alert" className={styles.problem}>{CALIBRATE.problem[problems[f]!] ?? CALIBRATE.problem.missing}</span> : null
  const Ref = ({ f }: { f: keyof Answers }) =>
    reference ? (
      <span className={styles.ref} style={muted}>
        <span className={styles.refLabel}>{CALIBRATE.lastTime}</span>
        <span className={styles.refValue}>{reference[f]}</span>
      </span>
    ) : <span className={styles.ref} aria-hidden />

  const Num = ({ name, label }: { name: keyof Answers; label: string }) => (
    <div className={styles.row}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{label}</span>
        <input name={name} inputMode="numeric" autoComplete="off" className={styles.input} style={field} />
        <Problem f={name} />
      </label>
      <Ref f={name} />
    </div>
  )

  return (
    <form action={saveCalibrationAction} onSubmit={check} className={styles.form} noValidate>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="calibrationId" value={calibrationId} />

      {Object.keys(problems).length > 0 && (
        <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>{CALIBRATE.fixFirst}</p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{CALIBRATE.budgetHeading}</h2>
        <Num name="budgetSaid" label={CALIBRATE.budgetSaid} />
        <Num name="budgetMost" label={CALIBRATE.budgetMost} />
        <Num name="budgetStretchMost" label={CALIBRATE.budgetStretchMost} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{CALIBRATE.bedroomsHeading}</h2>
        <div className={styles.row}>
          {/* A select, not two radios: a radio meeting the 44px target looks wrong, one that
              looks right fails it. The empty first option is the honest unanswered state. */}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{CALIBRATE.bedroomsQuestion}</span>
            <select name="showsOneFewerBedroom" defaultValue="" className={styles.input} style={field}>
              <option value="">{CALIBRATE.chooseOne}</option>
              <option value="yes">{CALIBRATE.yes}</option>
              <option value="no">{CALIBRATE.no}</option>
            </select>
            <Problem f="showsOneFewerBedroom" />
          </label>
          <Ref f="showsOneFewerBedroom" />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{CALIBRATE.scoreHeading}</h2>
        <Num name="ofHowMany" label={CALIBRATE.ofHowMany} />
        <Num name="strongAtLeast" label={CALIBRATE.strongAtLeast} />
        <Num name="possibleAtLeast" label={CALIBRATE.possibleAtLeast} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{CALIBRATE.areasHeading}</h2>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{CALIBRATE.areasQuestion}</span>
            <span className={styles.hint} style={muted}>{CALIBRATE.areasNote} {CALIBRATE.areasEmpty}</span>
            <textarea name="adjacency" rows={4} className={`${styles.input} ${styles.area}`} style={field} />
          </label>
          <Ref f="adjacency" />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{CALIBRATE.whoAnswers}</span>
            <span className={styles.hint} style={muted}>{CALIBRATE.whoAnswersHint}</span>
            <input name="answeredBy" autoComplete="off" className={styles.input} style={field} />
            <Problem f="answeredBy" />
          </label>
          <span className={styles.ref} aria-hidden />
        </div>
      </section>

      <div className={styles.actions}><Submit /></div>
    </form>
  )
}

/** Disabled only while its own save is in flight, so a double click cannot become two sittings. */
function Submit() {
  const { pending } = useFormStatus()
  return <button type="submit" className={styles.primary} disabled={pending} aria-busy={pending}>{CALIBRATE.save}</button>
}
