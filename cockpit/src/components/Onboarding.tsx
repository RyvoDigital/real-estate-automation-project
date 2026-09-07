'use client'

import { useMemo, useState, useTransition } from 'react'
import { createClient, validateCalendar, type CalendarProbe } from '@/lib/actions'
import { validate, type ClientDraft, type FieldError } from '@/lib/onboarding'
import { IconCheck, IconWarning } from './Icons'

/**
 * `title` is what fits on a 390px chip; `full` is what the step is actually
 * called. The full name is the accessible name of the chip and the heading on
 * the panel — a one-word chip is ambiguous read aloud, and "Booking" alone
 * does not say that the calendar is configured here.
 */
const STEPS = [
  { key: 'agency', title: 'Agency', full: 'Agency', hint: 'Who they are, and where they operate' },
  { key: 'voice', title: 'Voice', full: 'Voice and languages', hint: 'What the assistant is called' },
  { key: 'booking', title: 'Booking', full: 'Booking and calendar', hint: 'Four fields have burned us before' },
  { key: 'escalation', title: 'Escalation', full: 'Escalation', hint: 'Who gets told, and when' },
  { key: 'review', title: 'Review', full: 'Review and create', hint: 'Nothing is written until here' },
] as const

const EMPTY: ClientDraft = {
  agencyName: '', whatsappNumber: '', timezone: 'Europe/Lisbon', locale: 'pt-PT',
  defaultLanguage: 'pt', areas: '', agentName: '', workingHours: 'Mon–Sat 09:30 – 19:30',
  bookingWindowDays: '14', minHoursNotice: '4', viewingDurationMinutes: '45',
  highValueThresholdEur: '1500000', escalateTo: '', calendarId: '',
  handoffPt: '', handoffEn: '', handoffEs: '',
}

/** Which fields belong to which step, so a step only reports its own errors.
 *  `handoff_*` is the shape validate() reports; the input keys are camelCase. */
const FIELDS: Record<string, string[]> = {
  agency: ['agencyName', 'whatsappNumber', 'timezone', 'locale', 'defaultLanguage', 'areas'],
  voice: ['agentName', 'handoff_pt', 'handoff_en', 'handoff_es', 'handoffPt', 'handoffEn', 'handoffEs'],
  booking: ['calendarId', 'workingHours', 'bookingWindowDays', 'minHoursNotice', 'viewingDurationMinutes'],
  escalation: ['escalateTo', 'highValueThresholdEur'],
  review: [],
}

const STEP_OF: Record<string, number> = {}
STEPS.forEach((s, i) => FIELDS[s.key].forEach((f) => (STEP_OF[f] = i)))

export function Onboarding() {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<ClientDraft>(EMPTY)
  const [probe, setProbe] = useState<CalendarProbe | null>(null)
  const [serverErrors, setServerErrors] = useState<FieldError[]>([])
  const [done, setDone] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [pending, start] = useTransition()

  /**
   * WHEN AN ERROR IS ALLOWED TO BE VISIBLE.
   *
   * The old form ran validate() on an empty draft and painted every required
   * field red before a single keystroke. That is §6b in the interface: a
   * warning shown before there is anything to warn about trains you to ignore
   * it, and it would be ignored on the day it was right.
   *
   * So validation itself is unchanged — src/lib/onboarding.ts still decides
   * what is wrong, and `all` below is still the gate on Create. Only the
   * moment of DISPLAY moves: a field speaks up after you have left it
   * (`touched`), or after you have left the step it lives on (`attempted`).
   */
  const [touched, setTouched] = useState<Record<string, true>>({})
  const [attempted, setAttempted] = useState<Record<number, true>>({})

  const errors = useMemo(() => validate(draft), [draft])
  const all = [...errors, ...serverErrors]

  const visible = (f: string) => touched[f] === true || attempted[STEP_OF[f] ?? 99] === true
  const errFor = (f: string) => (visible(f) ? all.find((e) => e.field === f)?.message : undefined)
  const stepErrors = (i: number) => errors.filter((e) => FIELDS[STEPS[i].key].includes(e.field))
  const stepClean = (i: number) => stepErrors(i).length === 0

  /** Moving forward past a step is the submit gesture for that step. */
  const goto = (n: number) => {
    setAttempted((a) => {
      const next = { ...a }
      for (let i = 0; i < n; i++) next[i] = true
      return next
    })
    setStep(n)
  }

  const set = (k: keyof ClientDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((d) => ({ ...d, [k]: e.target.value }))
    setServerErrors([])
  }

  const field = (
    k: keyof ClientDraft,
    label: string,
    extra?: React.InputHTMLAttributes<HTMLInputElement> & { wide?: boolean },
  ) => {
    const { wide, ...attrs } = extra ?? {}
    const err = errFor(k)
    return (
      <label className={`ofield${wide ? ' ofield--wide' : ''}`}>
        <span className="ofield__label">{label}</span>
        <input
          className={`field${err ? ' field--bad' : ''}`}
          value={draft[k]}
          onChange={set(k)}
          onBlur={() => setTouched((t) => ({ ...t, [k]: true }))}
          aria-invalid={err ? true : undefined}
          {...attrs}
        />
        {err && <span className="ofield__err">{err}</span>}
      </label>
    )
  }

  if (done) {
    return (
      <div className="odone">
        <h2>{done}</h2>
        <p>
          Send it a WhatsApp message to prove the whole path before telling the client it is
          live. A created row is not a working automation.
        </p>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => {
            setDone(null)
            setDraft(EMPTY)
            setStep(0)
            setProbe(null)
            setTouched({})
            setAttempted({})
          }}
        >
          Onboard another
        </button>
      </div>
    )
  }

  return (
    <div className="onb">
      {/* A contained scroller: five steps do not fit across 390px, and the old
          rail set the page width instead of its own. */}
      <ol className="steps">
        {STEPS.map((s, i) => {
          const done = i < step && stepClean(i)
          return (
            <li key={s.key}>
              <button
                type="button"
                className={`step${i === step ? ' step--on' : done ? ' step--done' : ''}`}
                onClick={() => goto(i)}
                aria-current={i === step}
                aria-label={s.full}
                title={s.full}
              >
                <span className="step__n">{done ? <IconCheck size={12} /> : i + 1}</span>
                {s.title}
                {attempted[i] && !stepClean(i) && ` · ${stepErrors(i).length}`}
              </button>
            </li>
          )
        })}
      </ol>

      <div className="opanel">
        <div>
          <h2>{STEPS[step].full}</h2>
          <span className="opanel__sub">{STEPS[step].hint}</span>
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
            {field('handoffPt', 'Handoff note — Português', { wide: true })}
            {field('handoffEn', 'Handoff note — English', { wide: true })}
            {field('handoffEs', 'Handoff note — Español', { wide: true })}
            <p className="onote ofield--wide">
              This is what the lead is sent when the assistant has failed, which is exactly when
              it cannot be written for you. One is required for every language this client can be
              spoken to in.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="ogrid">
            {field('calendarId', 'Google calendar id', {
              placeholder: 'viewings@agency.com',
              wide: true,
            })}
            <div className="ocal ofield--wide">
              <button
                className="btn btn--ghost"
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
            <p className="onote ofield--wide">
              A lead above the threshold is handed over even when the assistant is working
              perfectly. That is a good escalation, not a fault.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            {all.length > 0 ? (
              <div className="notice notice--bad">
                <IconWarning size={14} />
                <span>
                  {all.length} field(s) still need fixing. The steps with a count are the ones to
                  open.
                </span>
              </div>
            ) : (
              <div className="notice notice--ok">
                <span>Everything validates. Nothing is written until you press create.</span>
              </div>
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
                <IconWarning size={14} />
                <span>{failed}</span>
              </div>
            )}
          </div>
        )}

        <div className="ofoot">
          <span className="ofoot__mid">
            {step < 4
              ? attempted[step] && !stepClean(step)
                ? `${stepErrors(step).length} to fix — you can continue and come back.`
                : STEPS[step].hint
              : 'Creating writes one clients row and one client_automations config.'}
          </span>
          <div className="ofoot__row">
            <button
              className="btn btn--ghost"
              type="button"
              disabled={step === 0 || pending}
              onClick={() => goto(step - 1)}
            >
              Back
            </button>
            {step < 4 ? (
              <button className="btn btn--primary" type="button" onClick={() => goto(step + 1)}>
                Continue
              </button>
            ) : (
              <button
                className="btn btn--primary"
                type="button"
                disabled={pending || all.length > 0}
                onClick={() =>
                  start(async () => {
                    setFailed(null)
                    const r = await createClient(draft)
                    if (r.ok) setDone(r.message)
                    else {
                      setServerErrors(r.errors)
                      setAttempted({ 0: true, 1: true, 2: true, 3: true, 4: true })
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
    </div>
  )
}
