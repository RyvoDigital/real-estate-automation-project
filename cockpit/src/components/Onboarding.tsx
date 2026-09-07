'use client'

import { useMemo, useState, useTransition } from 'react'
import { createClient, validateCalendar, type CalendarProbe } from '@/lib/actions'
import { validate, type ClientDraft, type FieldError } from '@/lib/onboarding'
import { IconWarning } from './Icons'

const STEPS = [
  { key: 'agency', title: 'Agency', hint: 'Who they are, and where they operate' },
  { key: 'voice', title: 'Voice and languages', hint: 'What the assistant is called' },
  { key: 'booking', title: 'Booking and calendar', hint: 'Four fields have burned us before' },
  { key: 'escalation', title: 'Escalation', hint: 'Who gets told, and when' },
  { key: 'review', title: 'Review and create', hint: 'Nothing is written until here' },
] as const

const EMPTY: ClientDraft = {
  agencyName: '', whatsappNumber: '', timezone: 'Europe/Lisbon', locale: 'pt-PT',
  defaultLanguage: 'pt', areas: '', agentName: '', workingHours: 'Mon–Sat 09:30 – 19:30',
  bookingWindowDays: '14', minHoursNotice: '4', viewingDurationMinutes: '45',
  highValueThresholdEur: '1500000', escalateTo: '', calendarId: '',
  handoffPt: '', handoffEn: '', handoffEs: '',
}

/** Which fields belong to which step, so a step only reports its own errors. */
const FIELDS: Record<string, (keyof ClientDraft | string)[]> = {
  agency: ['agencyName', 'whatsappNumber', 'timezone', 'locale', 'defaultLanguage', 'areas'],
  voice: ['agentName', 'handoff_pt', 'handoff_en', 'handoff_es'],
  booking: ['calendarId', 'workingHours', 'bookingWindowDays', 'minHoursNotice', 'viewingDurationMinutes'],
  escalation: ['escalateTo', 'highValueThresholdEur'],
  review: [],
}

export function Onboarding() {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<ClientDraft>(EMPTY)
  const [probe, setProbe] = useState<CalendarProbe | null>(null)
  const [serverErrors, setServerErrors] = useState<FieldError[]>([])
  const [done, setDone] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const errors = useMemo(() => validate(draft), [draft])
  const all = [...errors, ...serverErrors]
  const errFor = (f: string) => all.find((e) => e.field === f)?.message
  const stepErrors = (i: number) => errors.filter((e) => FIELDS[STEPS[i].key].includes(e.field))
  const stepClean = (i: number) => stepErrors(i).length === 0

  const set = (k: keyof ClientDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }))
    setServerErrors([])
  }

  const field = (k: keyof ClientDraft, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="ofield">
      <span className="ofield__label">{label}</span>
      <input
        className={`field${errFor(k) ? ' field--bad' : ''}`}
        value={draft[k]}
        onChange={set(k)}
        {...extra}
      />
      {errFor(k) && <span className="ofield__err">{errFor(k)}</span>}
    </label>
  )

  if (done) {
    return (
      <div className="odone">
        <h2>{done}</h2>
        <p>
          Send it a WhatsApp message to prove the whole path before telling the client it is
          live. A created row is not a working automation.
        </p>
        <button className="btn-ghost" type="button" onClick={() => { setDone(null); setDraft(EMPTY); setStep(0); setProbe(null) }}>
          Onboard another
        </button>
      </div>
    )
  }

  return (
    <div className="onb">
      <ol className="orail">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`orail__step${i === step ? ' orail__step--on' : ''}`}>
            <button type="button" className="orail__dot" onClick={() => setStep(i)} aria-current={i === step}>
              {i < step && stepClean(i) ? '✓' : i + 1}
            </button>
            <span className="orail__text">
              <span className="orail__title">{s.title}</span>
              <span className="orail__hint">
                {i < step && !stepClean(i) ? `${stepErrors(i).length} to fix` : s.hint}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="opanel">
        <div className="opanel__head">
          <h2>{STEPS[step].title}</h2>
          <span>{STEPS[step].hint}</span>
        </div>

        {step === 0 && (
          <div className="ogrid">
            {field('agencyName', 'Agency name', { placeholder: 'Marbella Sur' })}
            {field('whatsappNumber', 'WhatsApp number', { placeholder: '+34600123456' })}
            {field('timezone', 'Timezone', { placeholder: 'Europe/Madrid' })}
            {field('locale', 'Locale', { placeholder: 'es-ES' })}
            {field('defaultLanguage', 'Default language', { placeholder: 'es' })}
            {field('areas', 'Areas served', { placeholder: 'Marbella, Estepona' })}
          </div>
        )}

        {step === 1 && (
          <div className="ogrid">
            {field('agentName', 'Assistant name', { placeholder: 'Lucía' })}
            <span />
            {field('handoffPt', 'Handoff note — Português')}
            {field('handoffEn', 'Handoff note — English')}
            {field('handoffEs', 'Handoff note — Español')}
            <p className="onote">
              This is what the lead is sent when the assistant has failed, which is exactly when
              it cannot be written for you. One is required for every language this client can be
              spoken to in.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="ogrid">
            <div className="ospan">
              {field('calendarId', 'Google calendar id', { placeholder: 'viewings@agency.com' })}
              <div className="ocal">
                <button
                  className="btn-ghost"
                  type="button"
                  disabled={pending || !draft.calendarId.trim()}
                  onClick={() =>
                    start(async () => setProbe(await validateCalendar(draft.calendarId, draft.timezone)))
                  }
                >
                  {pending ? 'Asking Google…' : 'Check this calendar'}
                </button>
                {probe && (
                  <span className={`notice notice--${probe.ok ? 'ok' : 'bad'}`}>
                    {probe.ok
                      ? `Free/busy answered with the calendar present and no errors — ${probe.busyCount} busy interval(s) this week. A green tick here means the read was real.`
                      : `Not confirmed (${probe.error}). An unreadable calendar returns 200 with an empty busy list, which is indistinguishable from a free one.`}
                  </span>
                )}
              </div>
            </div>
            {field('workingHours', 'Working hours')}
            {field('bookingWindowDays', 'Booking window (days)', { inputMode: 'numeric' })}
            {field('minHoursNotice', 'Minimum notice (hours)', { inputMode: 'numeric' })}
            {field('viewingDurationMinutes', 'Viewing length (minutes)', { inputMode: 'numeric' })}
          </div>
        )}

        {step === 3 && (
          <div className="ogrid">
            {field('escalateTo', 'Escalate to', { placeholder: '+34600123456' })}
            {field('highValueThresholdEur', 'High-value threshold (€)', { inputMode: 'numeric' })}
            <p className="onote">
              A lead above the threshold is handed over even when the assistant is working
              perfectly. That is a good escalation, not a fault.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="oreview">
            {all.length > 0 ? (
              <div className="notice notice--bad">
                <IconWarning size={14} /> {all.length} field(s) still need fixing. The steps with
                a count are the ones to open.
              </div>
            ) : (
              <div className="notice notice--ok">Everything validates. Nothing is written until you press create.</div>
            )}
            <dl className="osummary">
              {Object.entries({
                Agency: draft.agencyName, WhatsApp: draft.whatsappNumber, Timezone: draft.timezone,
                Locale: draft.locale, Language: draft.defaultLanguage, Areas: draft.areas,
                Assistant: draft.agentName, Calendar: draft.calendarId, Hours: draft.workingHours,
                Window: `${draft.bookingWindowDays} days`, Notice: `${draft.minHoursNotice}h`,
                Viewing: `${draft.viewingDurationMinutes} min`, 'Escalate to': draft.escalateTo,
                'High value': `€${draft.highValueThresholdEur}`,
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {failed && (
              <div className="notice notice--bad">
                <IconWarning size={14} /> {failed}
              </div>
            )}
          </div>
        )}

        <div className="ofoot">
          <button className="btn-ghost" type="button" disabled={step === 0 || pending} onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
          <span className="ofoot__mid">
            {step < 4
              ? stepClean(step)
                ? 'This step is complete.'
                : `${stepErrors(step).length} to fix — you can continue and come back.`
              : 'Creating writes one clients row and one client_automations config.'}
          </span>
          {step < 4 ? (
            <button className="btn-solid" type="button" onClick={() => setStep((s) => s + 1)}>
              Continue
            </button>
          ) : (
            <button
              className="btn-solid"
              type="button"
              disabled={pending || all.length > 0}
              onClick={() =>
                start(async () => {
                  setFailed(null)
                  const r = await createClient(draft)
                  if (r.ok) setDone(r.message)
                  else {
                    setServerErrors(r.errors)
                    setFailed(r.message)
                  }
                })
              }
            >
              {pending ? 'Creating…' : 'Create client'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
