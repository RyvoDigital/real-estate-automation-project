'use client'
import Link from 'next/link'

import { useMemo, useState, useTransition } from 'react'
import { createClient, validateCalendar, type CalendarProbe } from '@/lib/actions'
import { validate, type ClientDraft, type FieldError } from '@/lib/onboarding'
import { probeVerdict } from '@/lib/onboarding-create'
import { REHEARSAL_OPTIONS } from '@/lib/rehearsal'
import { StateChip } from '@/components/state-chip'
import styles from './onboarding.module.css'

/*
 * Taking on a new client: the form, rebuilt 22 Sep 2026 in The Month's
 * direction (checkpoint 2), on its own route (/onboarding/new) since 22 Sep: three
 * sections on a two-column grid rather than a five-step
 * wizard; the rules are unchanged and live in lib/onboarding.ts (validate) and
 * lib/onboarding-create.ts (the write, one transaction since 0053).
 *
 *   🔴 "Is this a real agency?" is asked in the first section, full width, required, with NOTHING
 *      pre-selected (0037/0038): a pre-selected radio collects a click, not a
 *      decision.
 *   🔒 The starting values are the old form's, for the reasons written there:
 *      the agency's own facts (timezone, locale, language) start EMPTY, because
 *      only the agency can answer them; Ryvo's policy values (window, notice,
 *      duration, threshold) start as our defaults.
 *   🔒 The calendar check says which of three things happened: confirmed, the
 *      calendar is wrong (Google answered about it), or the check could not run
 *      (brief §2.8, S4). Only the second is the operator's to fix.
 *   🔒 A field's error shows once it has been touched, or after a create was
 *      attempted: an empty form painted red on arrival reports nothing.
 *   No control is ever disabled (§0.4-7); while working, a button says so.
 */

const EMPTY: ClientDraft = {
  agencyName: '', rehearsal: '', whatsappNumber: '', timezone: '', locale: '', defaultLanguage: '', areas: '',
  agentName: '', workingHours: 'Mon–Sat 09:30 – 19:30', bookingWindowDays: '14', minHoursNotice: '4',
  viewingDurationMinutes: '45', highValueThresholdEur: '1500000', escalateTo: '', calendarId: '',
  handoffPt: '', handoffEn: '', handoffEs: '',
}

// validate() names the handoff notes in the column's shape
const ALIAS: Record<string, string> = { handoffPt: 'handoff_pt', handoffEn: 'handoff_en', handoffEs: 'handoff_es' }

export function NewClient() {
  const [draft, setDraft] = useState<ClientDraft>(EMPTY)
  const [touched, setTouched] = useState<Record<string, true>>({})
  const [attempted, setAttempted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldError[]>([])
  const [probe, setProbe] = useState<CalendarProbe | null>(null)
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string; clientId?: string } | null>(null)
  const [checking, startCheck] = useTransition()
  const [creating, startCreate] = useTransition()

  const errors = useMemo(() => validate(draft), [draft])
  const errFor = (k: string) => {
    if (!attempted && !touched[k]) return undefined
    const names = [k, ALIAS[k]].filter(Boolean)
    return [...serverErrors, ...errors].find((e) => names.includes(e.field))?.message
  }
  const set = (k: keyof ClientDraft, v: string) => { setDraft((d) => ({ ...d, [k]: v })); setServerErrors([]) }
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))

  const field = (k: keyof ClientDraft, label: string, o: { hint?: string; placeholder?: string; wide?: boolean; area?: boolean; numeric?: boolean } = {}) => {
    const err = errFor(k)
    const common = {
      className: styles.input, name: k, value: draft[k], placeholder: o.placeholder,
      onChange: (e: { target: { value: string } }) => set(k, e.target.value), onBlur: () => touch(k),
      'aria-invalid': err ? true : undefined,
    }
    return (
      <label className={`${styles.field}${o.wide ? ` ${styles.wide}` : ''}`}>
        <span className={styles.fieldLabel}>{label}{o.hint ? <small>{o.hint}</small> : null}</span>
        {o.area ? <textarea {...common} /> : <input {...common} inputMode={o.numeric ? 'numeric' : undefined} />}
        {err ? <span className={styles.err} role="alert">{err}</span> : null}
      </label>
    )
  }

  const verdict = probe ? probeVerdict(probe) : null

  return (
    <div className={styles.sections}>
      <section className={styles.panel} aria-label="The agency">
        <h2 className={styles.sectionTitle}>The agency</h2>
        <div className={styles.grid}>
          {field('agencyName', 'Agency name', { placeholder: 'Marbella Sur' })}
          {field('whatsappNumber', 'WhatsApp number', { placeholder: '+34600123456', hint: 'inbound routes by it' })}
          <fieldset className={`${styles.choices} ${styles.wide}`}>
            <legend>Is this a real agency?</legend>
            {REHEARSAL_OPTIONS.map((o) => (
              <label key={o.value} className={styles.choice}>
                <input type="radio" name="rehearsal" value={o.value} checked={draft.rehearsal === o.value}
                  onChange={() => { set('rehearsal', o.value); touch('rehearsal') }} />
                <span><b>{o.label}</b><span>{o.means}</span></span>
              </label>
            ))}
            {errFor('rehearsal') ? <span className={styles.err} role="alert">{errFor('rehearsal')}</span> : null}
          </fieldset>
          {field('timezone', 'Timezone', { placeholder: 'Europe/Madrid' })}
          {field('locale', 'Locale', { placeholder: 'es-ES' })}
          {field('defaultLanguage', 'Default language', { placeholder: 'es', hint: 'pt, en or es' })}
          {field('areas', 'Areas served', { placeholder: 'Marbella, Estepona' })}
        </div>
      </section>

      <section className={styles.panel} aria-label="How it speaks and hands over">
        <h2 className={styles.sectionTitle}>How it speaks and hands over</h2>
        <div className={styles.grid}>
          {field('agentName', 'Assistant name', { placeholder: 'Lucía', hint: 'a label; it routes nothing' })}
          {field('escalateTo', 'Escalate to', { placeholder: '+34600123456', hint: 'a WhatsApp number' })}
          {field('handoffPt', 'Handoff note, Português', { area: true })}
          {field('handoffEn', 'Handoff note, English', { area: true })}
          {field('handoffEs', 'Handoff note, Español', { area: true })}
          {field('highValueThresholdEur', 'High-value threshold', { hint: '€', numeric: true })}
          <p className={`${styles.note} ${styles.wide}`}>A handoff note is what a lead is sent when the assistant has failed, which is exactly when it cannot be written for you: one for every language this client can be spoken to in. A lead above the threshold is handed over even when the assistant is working perfectly; that is a good escalation, not a fault.</p>
        </div>
      </section>

      <section className={styles.panel} aria-label="The calendar">
        <h2 className={styles.sectionTitle}>The calendar</h2>
        <div className={styles.grid}>
          {field('calendarId', 'Google calendar id', { placeholder: 'viewings@agency.com' })}
          <div className={styles.checkCell}>
            <button type="button" className={styles.ghost}
              onClick={() => { if (!draft.calendarId.trim()) { touch('calendarId'); return } startCheck(async () => setProbe(await validateCalendar(draft.calendarId, draft.timezone))) }}>
              {checking ? 'Asking Google…' : 'Check this calendar'}
            </button>
          </div>
          {probe && !checking ? (
            <span className={`${styles.outcome} ${styles.wide}`} role="status">
              {verdict === 'confirmed' ? <><StateChip meaning="through">confirmed</StateChip> Free/busy answered with this calendar and no errors: {probe.busyCount} busy interval(s) this week.</>
                : verdict === 'calendar_wrong' ? <><StateChip meaning="red">not this calendar</StateChip> Google answered about it and did not confirm it ({probe.error}). Check the id, and that it is shared with the booking account.</>
                : <><StateChip meaning="grey">the check could not run</StateChip> {probe.error ?? 'no reason given'}. This says nothing about the calendar itself.</>}
            </span>
          ) : null}
          {field('workingHours', 'Working hours')}
          {field('bookingWindowDays', 'Booking window', { hint: 'days', numeric: true })}
          {field('minHoursNotice', 'Minimum notice', { hint: 'hours', numeric: true })}
          {field('viewingDurationMinutes', 'Meeting length', { hint: 'minutes', numeric: true })}
        </div>
      </section>

      <div className={styles.actions}>
        <button type="button" className={styles.submit}
          onClick={() => {
            setAttempted(true)
            if (errors.length) { setOutcome({ ok: false, message: `${errors.length} field(s) need fixing.` }); return }
            startCreate(async () => {
              const r = await createClient(draft)
              if (r.ok) { setOutcome({ ok: true, message: r.message, clientId: r.clientId }); setDraft(EMPTY); setTouched({}); setAttempted(false); setProbe(null) }
              else { setServerErrors(r.errors); setOutcome({ ok: false, message: r.message }) }
            })
          }}>
          {creating ? 'Creating…' : 'Create the client'}
        </button>
        {outcome && !creating ? (
          outcome.ok
            ? <span className={styles.outcome} role="status"><StateChip meaning="through">created</StateChip> {outcome.message} <Link className={styles.out} href={`/onboarding?client=${outcome.clientId}`}>Open its checklist</Link></span>
            : <span className={styles.outcome} role="status"><StateChip meaning="red">not created</StateChip> {outcome.message}</span>
        ) : null}
      </div>
    </div>
  )
}
