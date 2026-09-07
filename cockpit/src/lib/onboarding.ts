import { isValidPhoneNumber } from 'libphonenumber-js'

/**
 * Onboarding validation. No React and no `server-only`, so it is directly
 * unit-testable — these are the rules that have already cost incidents, and
 * a rule whose only test is "the form looked right" is not a rule.
 */

export type FieldError = { field: string; message: string }

export type ClientDraft = {
  agencyName: string
  whatsappNumber: string
  timezone: string
  locale: string
  defaultLanguage: string
  areas: string
  agentName: string
  workingHours: string
  bookingWindowDays: string
  minHoursNotice: string
  viewingDurationMinutes: string
  highValueThresholdEur: string
  escalateTo: string
  calendarId: string
  handoffPt: string
  handoffEn: string
  handoffEs: string
}

/**
 * A real IANA zone, checked against the platform's own tz database rather
 * than a list we would have to maintain. "GMT+1" and "Europe/Lisboa" both
 * look plausible and both break the slot engine, which does every
 * calculation in the client's zone.
 */
export function isIanaZone(tz: string): boolean {
  if (!tz || !tz.includes('/')) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * A real, country-aware phone check.
 *
 * The first version was a length range, and it PASSED "+34 600 12 34" — the
 * Spanish mobile two digits short, which is the exact failure this field
 * exists to catch. A generic 8-to-15-digit rule cannot know that Spain wants
 * nine after the country code, and loosening the test to match the rule would
 * have deleted the only thing standing between a bad number and an escalation
 * alert nobody receives. §6b: ask what the weakened check would stop
 * catching, and whether it has happened. It had.
 *
 * libphonenumber-js is a library, not a vendor — no account, no network, no
 * new service in the stack. It carries Google's per-country metadata, which
 * is the thing we cannot write ourselves and must not approximate.
 */
export function isPlausiblePhone(v: string): boolean {
  const s = v.replace(/[\s()\-\u2013\u2014]/g, '')
  if (!/^\+[1-9]\d{6,15}$/.test(s)) return false
  try {
    return isValidPhoneNumber(s)
  } catch {
    return false
  }
}

const LANGS = ['pt', 'en', 'es'] as const

/**
 * Which languages this client will actually be spoken to in. The handoff
 * note is what a lead is sent WHEN THE MODEL HAS FAILED, so it cannot be
 * generated at the time and must exist up front for every language in the
 * config — see the Phase 1 completion notes.
 */
export function languagesFor(draft: ClientDraft): string[] {
  const set = new Set<string>([draft.defaultLanguage])
  for (const l of LANGS) if (l === draft.defaultLanguage) set.add(l)
  return [...set].filter(Boolean)
}

export function validate(draft: ClientDraft): FieldError[] {
  const e: FieldError[] = []
  const need = (field: keyof ClientDraft, label: string) => {
    if (!String(draft[field] ?? '').trim()) e.push({ field, message: `${label} is required.` })
  }

  need('agencyName', 'Agency name')
  need('agentName', 'Assistant name')
  need('areas', 'Areas served')
  need('calendarId', 'Calendar id')

  if (!isPlausiblePhone(draft.whatsappNumber)) {
    e.push({ field: 'whatsappNumber', message: 'Needs the country code, like +351912345678.' })
  }
  if (!isPlausiblePhone(draft.escalateTo)) {
    e.push({
      field: 'escalateTo',
      message: 'Needs the country code. This is the number that gets told when the AI stops.',
    })
  }
  if (!isIanaZone(draft.timezone)) {
    e.push({ field: 'timezone', message: 'Must be a real IANA zone, like Europe/Lisbon. Not an offset.' })
  }
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(draft.locale)) {
    e.push({ field: 'locale', message: 'Like pt-PT or es-ES.' })
  }
  if (!LANGS.includes(draft.defaultLanguage as (typeof LANGS)[number])) {
    e.push({ field: 'defaultLanguage', message: 'One of pt, en, es — the languages handoff notes exist for.' })
  }

  const num = (field: keyof ClientDraft, label: string, min: number, max: number) => {
    const n = Number(draft[field])
    if (!Number.isFinite(n) || n < min || n > max) {
      e.push({ field, message: `${label} must be between ${min} and ${max}.` })
    }
  }
  num('bookingWindowDays', 'Booking window', 1, 60)
  num('minHoursNotice', 'Minimum notice', 0, 168)
  num('viewingDurationMinutes', 'Viewing length', 15, 240)
  num('highValueThresholdEur', 'High-value threshold', 0, 100_000_000)

  if (!/^\s*\S.*\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/.test(draft.workingHours)) {
    e.push({ field: 'workingHours', message: 'Like: Mon–Sat 09:30 – 19:30' })
  }

  // Every language the client can be spoken to in needs its own handoff note.
  const notes: Record<string, string> = {
    pt: draft.handoffPt,
    en: draft.handoffEn,
    es: draft.handoffEs,
  }
  for (const lang of languagesFor(draft)) {
    if (!String(notes[lang] ?? '').trim()) {
      e.push({
        field: `handoff_${lang}`,
        message:
          `A ${lang} handoff note is required: it is what the lead is sent when the AI ` +
          `fails, which is exactly when it cannot be written for you.`,
      })
    }
  }

  return e
}

/** The config shape the workflow actually reads. Keys are $env-free and match
 *  cfg.* in ryvoInboundConc01 exactly — a key this file invents is a key the
 *  Concierge will silently ignore. */
export function toConfig(draft: ClientDraft) {
  return {
    agency_name: draft.agencyName.trim(),
    agent_name: draft.agentName.trim(),
    areas: draft.areas.split(',').map((a) => a.trim()).filter(Boolean),
    timezone: draft.timezone.trim(),
    working_hours: draft.workingHours.trim(),
    booking_window_days: Number(draft.bookingWindowDays),
    min_hours_notice: Number(draft.minHoursNotice),
    viewing_duration_minutes: Number(draft.viewingDurationMinutes),
    high_value_threshold_eur: Number(draft.highValueThresholdEur),
    escalate_to: draft.escalateTo.replace(/[\s()-]/g, ''),
    calendar_id: draft.calendarId.trim(),
    model: 'claude-sonnet-5',
    effort: 'low',
    thinking: 'adaptive',
    max_tokens: 1024,

    // The language the handoff note falls back to when detection is unsure.
    // Without it systemMessage() falls through to `languages[0]` and then to
    // 'en', so a Portuguese lead would be handed off in English at the exact
    // moment the assistant had already failed them.
    default_language: draft.defaultLanguage,
    languages: ['pt', 'en', 'es'],

    // `system_messages.handoff` — the key the Concierge ACTUALLY reads, via
    // systemMessage(cfg, 'handoff', leadText). An earlier version of this
    // function wrote `handoff` at the top level, which nothing reads: a client
    // onboarded through the form would have had no handoff note at all, and
    // would have discovered that only when the assistant failed. Found by
    // comparing a form-made config against the hand-made one, not by a test.
    system_messages: {
      handoff: {
        pt: draft.handoffPt.trim(),
        en: draft.handoffEn.trim(),
        es: draft.handoffEs.trim(),
      },
    },

    // Legacy single-string fallback systemMessage() uses when the per-language
    // bag misses. Same text as the default language, so it is never empty.
    handoff_note:
      draft.defaultLanguage === 'en'
        ? draft.handoffEn.trim()
        : draft.defaultLanguage === 'es'
          ? draft.handoffEs.trim()
          : draft.handoffPt.trim(),
  }
}
