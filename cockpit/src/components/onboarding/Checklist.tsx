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

function Chip({ state }: { state: Step['state'] }) {
  if (state === 'done') return <StateChip meaning="through">done</StateChip>
  if (state === 'unknown') return <StateChip meaning="grey">not known</StateChip>
  if (state === 'not_applicable') return <StateChip meaning="grey">not sold</StateChip>
  return <StateChip meaning="grey">outstanding</StateChip>
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
          <li key={s.key} className={styles.step}>
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
            {s.href && s.state !== 'done' ? (
              <a className={styles.out} href={s.href}>
                {s.key === 'declaration' ? 'Open the declaration, with the agency' : 'Open the calibration, with the agency'}
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
