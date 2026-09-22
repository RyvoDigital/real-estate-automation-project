'use client'

import { useActionState } from 'react'
import { recordDisclosure, recordRouting } from '@/lib/onboarding-actions'
import { RECORD_EMPTY, type RecordResult } from '@/lib/onboarding-record'
import { StateChip } from '@/components/state-chip'
import styles from './onboarding.module.css'

/*
 * The two records onboarding makes itself (0054). Each is a disclosure, closed
 * until needed. The server action re-reads the client and today; the form only
 * says which client it is about.
 *
 * No control is ever disabled (§0.4-7): while saving, the button says so. When
 * 0054 is not applied the form still opens and the save says why it cannot
 * write, rather than a greyed-out button nobody can explain.
 */

function Outcome({ state, pending }: { state: RecordResult; pending: boolean }) {
  if (pending) return <span className={styles.outcome}>Recording…</span>
  if (!state.message) return null
  return state.ok
    ? <span className={styles.outcome} role="status"><StateChip meaning="through">recorded</StateChip> {state.message}</span>
    : <span className={styles.outcome} role="status"><StateChip meaning="red">not recorded</StateChip> {state.message.replace(/^Not recorded: /, '')}</span>
}

const Err = ({ state, name }: { state: RecordResult; name: string }) =>
  state.errors[name] ? <span className={styles.err} role="alert">{state.errors[name]}</span> : null

export function RoutingForm({ clientId, others, recordable, today, min }: { clientId: string; others: { id: string; name: string }[]; recordable: boolean; today: string; min: string }) {
  const [state, action, pending] = useActionState(recordRouting, RECORD_EMPTY)
  const v = state.values
  return (
    <details className={styles.record}>
      <summary>Record the routing proof</summary>
      <form action={action} className={styles.form}>
        <input type="hidden" name="client_id" value={clientId} />
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>When</span>
            <input className={styles.input} type="date" name="happened_on" max={today} min={min} defaultValue={v.happened_on ?? today} />
            <Err state={state} name="happened_on" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>The existing client also messaged</span>
            <select className={styles.input} name="existing_client_id" defaultValue={v.existing_client_id ?? ''}>
              <option value="">Choose…</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <Err state={state} name="existing_client_id" />
          </label>
          <label className={`${styles.check} ${styles.wide}`}>
            <input type="checkbox" name="new_answered" value="yes" defaultChecked={v.new_answered === 'yes'} />
            <span>This client’s number answered with this client’s assistant, areas and config.<small>Send a message to its WhatsApp number and read the reply.</small></span>
          </label>
          <Err state={state} name="new_answered" />
          <label className={`${styles.check} ${styles.wide}`}>
            <input type="checkbox" name="existing_answered" value="yes" defaultChecked={v.existing_answered === 'yes'} />
            <span>The existing client’s number STILL answered as itself.<small>The half that is skipped. The failure is a real client’s leads answered by another client’s assistant.</small></span>
          </label>
          <Err state={state} name="existing_answered" />
        </div>
        {!recordable ? <p className={styles.note}>Migration 0054 is not applied yet, so this cannot be written. Saving will say so.</p> : null}
        <div className={styles.actions}>
          <button type="submit" className={styles.submit}>{pending ? 'Recording…' : 'Record both halves'}</button>
          <Outcome state={state} pending={pending} />
        </div>
      </form>
    </details>
  )
}

export function DisclosureForm({ clientId, recordable, today, min }: { clientId: string; recordable: boolean; today: string; min: string }) {
  const [state, action, pending] = useActionState(recordDisclosure, RECORD_EMPTY)
  const v = state.values
  return (
    <details className={styles.record}>
      <summary>Record the conversation</summary>
      <form action={action} className={styles.form}>
        <input type="hidden" name="client_id" value={clientId} />
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>When</span>
            <input className={styles.input} type="date" name="happened_on" max={today} min={min} defaultValue={v.happened_on ?? today} />
            <Err state={state} name="happened_on" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Who at the agency heard it<small>by name</small></span>
            <input className={styles.input} name="told" defaultValue={v.told ?? ''} />
            <Err state={state} name="told" />
          </label>
        </div>
        {!recordable ? <p className={styles.note}>Migration 0054 is not applied yet, so this cannot be written. Saving will say so.</p> : null}
        <div className={styles.actions}>
          <button type="submit" className={styles.submit}>{pending ? 'Recording…' : 'Record it'}</button>
          <Outcome state={state} pending={pending} />
        </div>
      </form>
    </details>
  )
}
