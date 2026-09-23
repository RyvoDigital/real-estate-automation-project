import Link from 'next/link'
import { StateChip } from '@/components/state-chip'
import type { Checklist as Model, Step } from '@/lib/onboarding-checklist'
import { DisclosureForm, RoutingForm } from './RecordForms'
import styles from './onboarding.module.css'

/*
 * One client's onboarding checklist (brief §2.8, S6). Rendered from the pure
 * model in lib/onboarding-checklist.ts, which decides every state; this only
 * draws it.
 *
 *   🔴 No "onboarded" chip while anything is outstanding or unknown: the model's
 *      `onboarded` is the only thing that can show one.
 *   Colour: done is the "went through" chip; outstanding and not-known are grey
 *   (an absence, not a conclusion). Nothing else on the screen is coloured.
 */

const KIND: Record<Step['kind'], string> = {
  form: 'filled in here',
  proof: 'proved here',
  conversation: 'a conversation',
}

/*
 * 🔴 "OUTSTANDING" AND "NOT KNOWN" WORE THE SAME GREY (fixed 23 Sep 2026), so
 * a step nobody has done looked exactly like one we could not read. They are
 * different facts and only one of them is work: outstanding takes the clock,
 * because an unfinished step ages and that ageing is the reason it matters.
 * Grey stays what grey means everywhere — uncertainty and absence.
 */
function Chip({ state }: { state: Step['state'] }) {
  if (state === 'done') return <StateChip meaning="through">done</StateChip>
  if (state === 'unknown') return <StateChip meaning="grey">not known</StateChip>
  if (state === 'not_applicable') return <StateChip meaning="grey">not sold</StateChip>
  return <StateChip meaning="clock">outstanding</StateChip>
}

export type ChecklistProps = {
  clientId: string
  model: Model
  others: { id: string; name: string }[]
  recordable: boolean
  today: string
  createdOn: string
}

export function Checklist({ clientId, model, others, recordable, today, createdOn }: ChecklistProps) {
  return (
    <section className={styles.panel} aria-label="Onboarding checklist">
      <ol className={styles.steps}>
        {model.steps.map((s) => (
          <li key={s.key} className={styles.step} data-state={s.state}>
            <div className={styles.stepHead}>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <Chip state={s.state} />
              <span className={styles.kind}>{KIND[s.kind]}</span>
              {s.on ? <span className={styles.on}>{s.on}</span> : null}
            </div>
            <p className={styles.stepLine}>{s.line}</p>
            {s.state === 'outstanding' && s.key === 'routing' ? (
              <RoutingForm clientId={clientId} others={others} recordable={recordable} today={today} min={createdOn} />
            ) : null}
            {s.state === 'outstanding' && s.key === 'disclosure' ? (
              <DisclosureForm clientId={clientId} recordable={recordable} today={today} min={createdOn} />
            ) : null}
            {/*
              * 🔴 SHOWN WHATEVER THE STATE (22 Sep 2026). This rendered only
              * while the step was NOT done — and these two links are the ONLY
              * way to reach /segmentation and /calibrate in the whole cockpit.
              * So the screen that writes a consent declaration disappeared the
              * moment it had been used once, and with every client onboarded
              * neither screen could be reached by clicking at all. A done step
              * still opens: the declaration is re-read with the agency, and a
              * calibration is re-answered when what they sell changes.
              */}
            {s.href ? (
              <Link className={styles.out} href={s.href}>
                {s.state === 'done'
                  ? (s.key === 'declaration' ? 'Open the declaration again' : 'Open the calibration again')
                  : (s.key === 'declaration' ? 'Open the declaration, with the agency' : 'Open the calibration, with the agency')}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
