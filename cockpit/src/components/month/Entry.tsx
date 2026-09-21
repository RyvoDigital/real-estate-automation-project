'use client'

import { useActionState } from 'react'
import { saveContract, saveCost, savePayment } from '@/lib/month/actions'
import { AUTOMATIONS, CADENCES, COST_CATEGORIES, EMPTY, PAYMENT_KINDS, type EntryResult } from '@/lib/month/entry'
import { StateChip } from '@/components/state-chip'
import styles from './entry.module.css'

/*
 * The Month's three entries (brief I §2.10: "what a person must enter, and when
 * — nothing else"). Each form is a disclosure, closed until needed.
 *
 * After a save the action re-renders the page in the same response, so every
 * figure above is already current. On a failure the action hands back what was
 * typed, and React's post-action reset restores exactly those values (they are
 * the fields' defaults), so nothing typed is lost.
 *
 * No control is ever disabled (the controls probe refuses one): while saving,
 * the button says so instead.
 */

export type PartyOption = { value: string; label: string; business: 'automation' | 'web'; rehearsal: boolean }
export type ContractOption = { id: string; label: string }

const LABEL: Record<string, string> = {
  setup: 'Setup', project: 'Project', monthly: 'Monthly receipt', other: 'Other',
  infrastructure: 'Infrastructure', messaging: 'Messaging', model: 'Model', tooling: 'Tooling', hosting: 'Hosting', domain: 'Domain',
  one_off: 'One-off', annual: 'Annual',
  inbound_concierge: 'Concierge', db_reactivation: 'Database reactivation', lead_nurture: 'Lead nurture', listing_launch: 'Listing launch', reputation_loop: 'Review requests',
}

function Field({ name, label, hint, state, children }: { name: string; label: string; hint?: string; state: EntryResult; children: React.ReactNode }) {
  const err = state.errors[name]
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}{hint ? <small>{hint}</small> : null}</span>
      {children}
      {err ? <span className={styles.err} role="alert">{err}</span> : null}
    </label>
  )
}

function Parties({ parties, only, state, optional }: { parties: PartyOption[]; only?: 'automation' | 'web'; state: EntryResult; optional?: string }) {
  const list = parties.filter((p) => !only || p.business === only)
  return (
    <select name="party" defaultValue={state.values.party ?? ''} className={styles.input}>
      <option value="">{optional ?? 'Choose…'}</option>
      {(['web', 'automation'] as const).map((b) => {
        const group = list.filter((p) => p.business === b)
        return group.length ? (
          <optgroup key={b} label={b === 'web' ? 'Web clients' : 'Automation clients'}>
            {group.map((p) => <option key={p.value} value={p.value}>{p.label}{p.rehearsal ? ' (rehearsal, not counted)' : ''}</option>)}
          </optgroup>
        ) : null
      })}
    </select>
  )
}

function Outcome({ state, pending }: { state: EntryResult; pending: boolean }) {
  if (pending) return <span className={styles.outcome}>Saving…</span>
  if (!state.message) return null
  return state.ok
    ? <span className={styles.saved} role="status"><StateChip meaning="through">saved</StateChip> {state.message}</span>
    : <span className={styles.failed} role="status"><StateChip meaning="red">not saved</StateChip> {state.message.replace(/^Not saved — /, '')}</span>
}

function ContractForm({ parties, contracts }: { parties: PartyOption[]; contracts: ContractOption[] }) {
  const [state, action, pending] = useActionState(saveContract, EMPTY)
  const v = state.values
  return (
    <form action={action} className={styles.form}>
      <div className={styles.grid}>
        <Field name="party" label="Client" state={state}><Parties parties={parties} state={state} /></Field>
        <Field name="monthly_eur" label="Monthly fee" hint="net of VAT" state={state}><input name="monthly_eur" inputMode="decimal" defaultValue={v.monthly_eur ?? ''} className={styles.input} /></Field>
        <Field name="starts_on" label="Billing starts" state={state}><input name="starts_on" type="date" defaultValue={v.starts_on ?? ''} className={styles.input} /></Field>
        <Field name="setup_eur" label="Setup fee" hint="net of VAT · optional" state={state}><input name="setup_eur" inputMode="decimal" defaultValue={v.setup_eur ?? ''} className={styles.input} /></Field>
        <Field name="setup_terms" label="Setup instalments" hint="optional" state={state}><input name="setup_terms" defaultValue={v.setup_terms ?? ''} className={styles.input} /></Field>
        <Field name="signed_by" label="Signed by" hint="the client's side" state={state}><input name="signed_by" defaultValue={v.signed_by ?? ''} className={styles.input} /></Field>
        <Field name="ends_on" label="Ends" hint="only when it ends" state={state}><input name="ends_on" type="date" defaultValue={v.ends_on ?? ''} className={styles.input} /></Field>
        <Field name="supersedes_id" label="Replaces" hint="a correction or an end: the contract it supersedes" state={state}>
          <select name="supersedes_id" defaultValue={v.supersedes_id ?? ''} className={styles.input}>
            <option value="">Nothing — a new contract</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <fieldset className={styles.checks}>
        <legend>Automations covered <small>automation clients only</small></legend>
        {AUTOMATIONS.map((a) => (
          <label key={a}><input type="checkbox" name="automations" value={a} defaultChecked={(v.automations ?? '').split(',').includes(a)} /> {LABEL[a]}</label>
        ))}
        {state.errors.automations ? <span className={styles.err} role="alert">{state.errors.automations}</span> : null}
      </fieldset>
      <div className={styles.actions}><button type="submit" className={styles.submit}>{pending ? 'Saving…' : 'Record the contract'}</button><Outcome state={state} pending={pending} /></div>
    </form>
  )
}

function PaymentForm({ parties }: { parties: PartyOption[] }) {
  const [state, action, pending] = useActionState(savePayment, EMPTY)
  const v = state.values
  return (
    <form action={action} className={styles.form}>
      <div className={styles.grid}>
        <Field name="party" label="Client" state={state}><Parties parties={parties} state={state} /></Field>
        <Field name="kind" label="For" state={state}>
          <select name="kind" defaultValue={v.kind ?? ''} className={styles.input}>
            <option value="">Choose…</option>
            {PAYMENT_KINDS.map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}
          </select>
        </Field>
        <Field name="amount_eur" label="Amount invoiced" hint="net of VAT" state={state}><input name="amount_eur" inputMode="decimal" defaultValue={v.amount_eur ?? ''} className={styles.input} /></Field>
        <Field name="invoiced_on" label="Invoiced on" hint="optional" state={state}><input name="invoiced_on" type="date" defaultValue={v.invoiced_on ?? ''} className={styles.input} /></Field>
        <Field name="settled_on" label="Arrived on" hint="leave empty until it arrives" state={state}><input name="settled_on" type="date" defaultValue={v.settled_on ?? ''} className={styles.input} /></Field>
        <Field name="settled_amount_eur" label="Amount that arrived" hint="net of VAT" state={state}><input name="settled_amount_eur" inputMode="decimal" defaultValue={v.settled_amount_eur ?? ''} className={styles.input} /></Field>
        <Field name="reference" label="Invoice reference" hint="optional" state={state}><input name="reference" defaultValue={v.reference ?? ''} className={styles.input} /></Field>
        <Field name="note" label="Note" hint="optional" state={state}><input name="note" defaultValue={v.note ?? ''} className={styles.input} /></Field>
      </div>
      <div className={styles.actions}><button type="submit" className={styles.submit}>{pending ? 'Saving…' : 'Record the payment'}</button><Outcome state={state} pending={pending} /></div>
    </form>
  )
}

function CostForm({ parties, recordable }: { parties: PartyOption[]; recordable: boolean }) {
  const [state, action, pending] = useActionState(saveCost, EMPTY)
  const v = state.values
  return (
    <form action={action} className={styles.form}>
      <div className={styles.grid}>
        <Field name="label" label="What" state={state}><input name="label" defaultValue={v.label ?? ''} className={styles.input} /></Field>
        <Field name="side" label="Whose" state={state}>
          <select name="side" defaultValue={v.side ?? ''} className={styles.input}>
            <option value="">Choose…</option>
            <option value="web">The web business</option>
            <option value="automation">The automation business</option>
            <option value="shared">The company — both</option>
          </select>
        </Field>
        <Field name="party" label="One client alone" hint={recordable ? 'optional' : 'needs migration 0052'} state={state}>
          <Parties parties={parties} state={state} optional="No — the business's own cost" />
        </Field>
        <Field name="category" label="Category" state={state}>
          <select name="category" defaultValue={v.category ?? ''} className={styles.input}>
            <option value="">Choose…</option>
            {COST_CATEGORIES.map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}
          </select>
        </Field>
        <Field name="amount_eur" label="Amount" hint="net of VAT · per cadence" state={state}><input name="amount_eur" inputMode="decimal" defaultValue={v.amount_eur ?? ''} className={styles.input} /></Field>
        <Field name="cadence" label="How often" state={state}>
          <select name="cadence" defaultValue={v.cadence ?? ''} className={styles.input}>
            <option value="">Choose…</option>
            {CADENCES.map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}
          </select>
        </Field>
        <Field name="started_on" label="Started" state={state}><input name="started_on" type="date" defaultValue={v.started_on ?? ''} className={styles.input} /></Field>
        <Field name="ended_on" label="Ended" hint="only when it ends" state={state}><input name="ended_on" type="date" defaultValue={v.ended_on ?? ''} className={styles.input} /></Field>
      </div>
      <div className={styles.actions}><button type="submit" className={styles.submit}>{pending ? 'Saving…' : 'Record the cost'}</button><Outcome state={state} pending={pending} /></div>
    </form>
  )
}

export function Entry({ parties, contracts, recordable }: { parties: PartyOption[]; contracts: ContractOption[]; recordable: boolean }) {
  return (
    <section className={styles.entry} aria-label="Record">
      <details className={styles.item}><summary>Record a contract</summary><ContractForm parties={parties} contracts={contracts} /></details>
      <details className={styles.item}><summary>Record a payment</summary><PaymentForm parties={parties} /></details>
      <details className={styles.item}><summary>Record a cost</summary><CostForm parties={parties} recordable={recordable} /></details>
    </section>
  )
}
