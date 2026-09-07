import { test } from 'node:test'
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
  const cfg = toConfig(good)
  // Lifted from cfg.* in ryvoInboundConc01. A key invented here is a key the
  // workflow silently ignores — which is how a client goes live with a
  // default booking window nobody chose.
  for (const k of [
    'agency_name',
    'agent_name',
    'areas',
    'timezone',
    'working_hours',
    'booking_window_days',
    'min_hours_notice',
    'viewing_duration_minutes',
    'high_value_threshold_eur',
    'escalate_to',
    'calendar_id',
    'model',
  ]) {
    assert.ok(k in cfg, `config is missing ${k}`)
  }
  assert.deepEqual(cfg.areas, ['Marbella', 'Estepona'])
  assert.equal(cfg.booking_window_days, 14, 'numbers are numbers, not strings')
  assert.equal(cfg.escalate_to, '+34600123456', 'stored normalised')
})
