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

/**
 * The workflow reads `working_hours` as `{start, end, days}` — `computeSlots`
 * does `String(workingHours.start).split(':')` and `workingHours.days`. This
 * form has always collected it as free text and `toConfig` wrote that text
 * through verbatim, so every client onboarded here got a STRING.
 *
 * That is not a degraded booking. `cursor.set({hour: NaN})` throws, and
 * ProposeSlots is on the path for EVERY inbound message with no error branch —
 * so the execution dies and the lead gets silence, from their first message on.
 * ZZ TEST carries exactly that row today; it has simply never had traffic.
 *
 * `toConfig` already carried the comment "keys match cfg.* in
 * ryvoInboundConc01 exactly". It did. The key was right and the VALUE SHAPE was
 * wrong, one level below where the promise was being checked.
 *
 * So the free text stays (it is the readable thing to type) and is parsed here
 * into the shape the engine reads. Anything unparseable is a validation error
 * rather than a row that reaches the workflow.
 */
const DAY_INDEX: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
}

export type WorkingHours = { start: string; end: string; days: number[] }

export function parseWorkingHours(text: string): WorkingHours | null {
  // Normalise the dashes people actually type: en dash, em dash, hyphen.
  const t = String(text ?? '').toLowerCase().replace(/[\u2010-\u2015]/g, '-').trim()
  if (!t) return null

  // Times last, so a day range's own dash is never mistaken for the time dash.
  const times = t.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/)
  if (!times) return null
  const [h1, m1, h2, m2] = [+times[1], +times[2], +times[3], +times[4]]
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${pad(h1)}:${pad(m1)}`
  const end = `${pad(h2)}:${pad(m2)}`
  // An end at or before the start yields no slots on any day, which would look
  // like "fully booked" forever rather than like the configuration error it is.
  if (end <= start) return null

  const dayPart = t.slice(0, times.index).trim().replace(/[,]+$/, '')
  const days = new Set<number>()

  const range = dayPart.match(/^([a-z]+)\s*-\s*([a-z]+)$/)
  if (range) {
    const a = DAY_INDEX[range[1]], b = DAY_INDEX[range[2]]
    if (a === undefined || b === undefined) return null
    // Mon–Sat, and also Sat–Mon, which wraps the week rather than being empty.
    for (let i = 0, d = a; i < 7; i++, d = (d % 7) + 1) {
      days.add(d)
      if (d === b) break
    }
  } else {
    for (const tok of dayPart.split(/[\s,]+/).filter(Boolean)) {
      const d = DAY_INDEX[tok]
      if (d === undefined) return null
      days.add(d)
    }
  }
  if (!days.size) return null
  return { start, end, days: [...days].sort((x, y) => x - y) }
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

  // Validated by PARSING it, not by pattern-matching it. The old regex accepted
  // anything containing two clock times, which is how a string the workflow
  // cannot read passed validation and reached a client_automations row.
  if (!parseWorkingHours(draft.workingHours)) {
    e.push({
      field: 'workingHours',
      message: 'Like: Mon–Sat 09:30 – 19:30 (days first, then the open and close times)',
    })
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
    // The parsed shape, never the raw text: computeSlots reads .start/.end/.days.
    // validate() has already refused anything unparseable, and the ?? is the
    // fail-loud rather than fail-silent branch if it is ever called without it.
    working_hours: parseWorkingHours(draft.workingHours) ?? null,
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

    /*
     * Listing ingestion (Automation 03, F2). The Concierge reads
     * `cfg.listing_ingest.agent_numbers` to decide whether an inbound message
     * is an agent sending a property rather than a lead enquiring.
     *
     * Written EMPTY rather than left absent. The branch handles an absent key
     * — it returns false and everything goes down the lead path — so this is
     * not load-bearing for correctness. It is here because the invariant is
     * "every key the workflow reads is a key the form writes", and the moment
     * that invariant gets an exception it stops being checkable. The last time
     * a key the workflow read was not written by the form, a client would have
     * been onboarded with no handoff note at all.
     *
     * An empty list also reads better to the operator than a missing key: it
     * says "no agent numbers configured yet", not "this feature does not
     * exist".
     */
    listing_ingest: {
      agent_numbers: [] as string[],
      areas: draft.areas.split(',').map((a) => a.trim()).filter(Boolean),
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
