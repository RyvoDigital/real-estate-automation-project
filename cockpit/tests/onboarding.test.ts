import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import {
  isIanaZone,
  isPlausiblePhone,
  toConfig,
  validate,
  type ClientDraft,
} from '../src/lib/onboarding'

/* Each of these guards a field that has already cost an incident. */

const good: ClientDraft = {
  agencyName: 'Marbella Sur',
  whatsappNumber: '+34600123456',
  timezone: 'Europe/Madrid',
  locale: 'es-ES',
  defaultLanguage: 'es',
  areas: 'Marbella, Estepona',
  agentName: 'Lucía',
  workingHours: 'Mon–Sat 09:30 – 19:30',
  bookingWindowDays: '14',
  minHoursNotice: '4',
  viewingDurationMinutes: '45',
  highValueThresholdEur: '1500000',
  escalateTo: '+34600123456',
  calendarId: 'viewings@marbellasur.es',
  handoffPt: 'Um colega entra em contacto.',
  handoffEn: 'A colleague will be in touch.',
  handoffEs: 'Un compañero se pondrá en contacto.',
}

test('a complete draft passes', () => {
  assert.deepEqual(validate(good), [])
})

test('timezone must be a real IANA zone, not an offset', () => {
  assert.equal(isIanaZone('Europe/Madrid'), true)
  assert.equal(isIanaZone('Europe/Lisbon'), true)
  assert.equal(isIanaZone('GMT+1'), false)
  assert.equal(isIanaZone('Europe/Lisboa'), false, 'plausible spelling, not a zone')
  assert.equal(isIanaZone('CET'), false, 'no slash, and not a location')
  assert.equal(isIanaZone(''), false)

  const bad = validate({ ...good, timezone: 'GMT+1' })
  assert.ok(bad.some((e) => e.field === 'timezone'))
})

test('escalate_to must be reachable — the two-digits-short case', () => {
  assert.equal(isPlausiblePhone('+34600123456'), true)
  assert.equal(isPlausiblePhone('+351 933 048 230'), true, 'spaces are fine')
  assert.equal(isPlausiblePhone('+346001234'), false, 'too short for a Spanish mobile')
  assert.equal(isPlausiblePhone('600123456'), false, 'no country code')
  assert.equal(isPlausiblePhone('+34ABC123456'), false)

  const bad = validate({ ...good, escalateTo: '+34 600 12 34' })
  assert.ok(bad.some((e) => e.field === 'escalateTo'))
})

test('a handoff note is required for the language the client actually uses', () => {
  // The note is what a lead is sent WHEN THE MODEL HAS FAILED, so it cannot
  // be generated at the time.
  const missing = validate({ ...good, handoffEs: '   ' })
  assert.ok(
    missing.some((e) => e.field === 'handoff_es'),
    'a Spanish client with no Spanish handoff note must not save',
  )

  // A language the client does not use is not required.
  const ptOnly = validate({ ...good, defaultLanguage: 'pt', handoffEs: '' })
  assert.ok(!ptOnly.some((e) => e.field === 'handoff_es'))
})

test('numeric bounds', () => {
  assert.ok(validate({ ...good, bookingWindowDays: '0' }).some((e) => e.field === 'bookingWindowDays'))
  assert.ok(validate({ ...good, viewingDurationMinutes: '5' }).some((e) => e.field === 'viewingDurationMinutes'))
  assert.ok(validate({ ...good, minHoursNotice: '-1' }).some((e) => e.field === 'minHoursNotice'))
  assert.ok(validate({ ...good, highValueThresholdEur: 'abc' }).some((e) => e.field === 'highValueThresholdEur'))
})

test('the config uses the keys the Concierge actually reads', () => {
  const cfg = toConfig(good) as Record<string, unknown>

  // DERIVED FROM THE SHIPPING WORKFLOW, not hand-listed. The previous version
  // of this test carried its own list, and the list happened to contain the
  // key the form wrote (`handoff`) rather than the key the workflow reads
  // (`system_messages.handoff`) — so it passed while a client onboarded
  // through the form would have had no handoff note at all.
  //
  // Lesson 15: never let a test hold its own copy of something the product
  // also holds. Render it from the artefact, and RAISE rather than fall back.
  const wf = readFileSync(
    new URL('../../workflows/ryvoInboundConc01.json', import.meta.url),
    'utf8',
  )
  const referenced = [...wf.matchAll(/cfg\.([a-z_]+)/g)].map((m) => m[1])
  assert.ok(referenced.length > 5, 'could not read cfg.* out of the workflow')

  const missing = [...new Set(referenced)].filter((k) => !(k in cfg))
  assert.deepEqual(missing, [], `config is missing keys the workflow reads: ${missing}`)

  // systemMessage() reaches these through its own parameter rather than as
  // `cfg.x`, so the regex above cannot see them. Asserted explicitly, with
  // the reason, so the next person knows why they are separate.
  const sm = cfg.system_messages as { handoff?: Record<string, string> }
  assert.ok(sm?.handoff, 'system_messages.handoff is what systemMessage(cfg, "handoff") reads')
  assert.equal(sm.handoff!.es, 'Un compañero se pondrá en contacto.')
  assert.ok(cfg.default_language, 'default_language decides the handoff language when detection is unsure')
  assert.ok(cfg.handoff_note, 'handoff_note is the legacy single-string fallback systemMessage() uses last')

  assert.deepEqual(cfg.areas, ['Marbella', 'Estepona'])
  assert.equal(cfg.booking_window_days, 14, 'numbers are numbers, not strings')
  assert.equal(cfg.escalate_to, '+34600123456', 'stored normalised')
})
