/**
 * The onboarding form and the slot engine, tied together.
 *
 * `toConfig` carried the comment "keys match cfg.* in ryvoInboundConc01
 * exactly". They did — and `working_hours` was still a free-text string the
 * engine cannot read, because the promise was being checked one level above
 * where the defect was. Agreement in a comment is not a tie.
 *
 * So this test does not restate the shape. It takes what `toConfig` actually
 * produces and feeds it to the actual `computeSlots` from `src/slot_engine.js`
 * — the same source the ProposeSlots node embeds — and asserts real bookable
 * slots come out. If either side moves, this goes red.
 *
 * Luxon is pinned to 3.7.2, the version inside the n8n container, so the engine
 * runs here against the same date library it runs against in production.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DateTime } from 'luxon'
import { toConfig, validate, parseWorkingHours } from '../src/lib/onboarding'
import { good as draft } from './fixtures/onboarding-draft'

type Slot = { dateLocal: string; timeLocal: string; startUtc: string }
type SlotEngine = (o: Record<string, unknown>) => { slots: Slot[] }

/** Load the SHIPPING engine source, exactly as tests/slot_engine.test.js does. */
function loadEngine(): SlotEngine {
  const src = readFileSync(join(__dirname, '..', '..', 'src', 'slot_engine.js'), 'utf8')
  const g = globalThis as unknown as { DateTime?: unknown }
  g.DateTime = DateTime
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${src}; return computeSlots;`)() as SlotEngine
}

test('the engine can actually read what the form produces', () => {
  assert.equal(validate(draft).length, 0, 'the fixture draft must be valid')
  const cfg = toConfig(draft)

  const slots = loadEngine()({
    nowISO: '2026-09-07T06:00:00Z', // a Monday
    tz: cfg.timezone,
    workingHours: cfg.working_hours,
    bookingWindowDays: cfg.booking_window_days,
    minHoursNotice: cfg.min_hours_notice,
    durationMinutes: cfg.viewing_duration_minutes,
    busy: [],
    maxSlots: 3,
    slotStepMinutes: 60,
  }).slots

  assert.ok(slots.length > 0, 'toConfig produced working_hours the engine cannot turn into slots')
  // Not just "some slots" — slots that honour what was typed. A parser that
  // returned a plausible default would pass the line above and be wrong.
  const wh = parseWorkingHours(draft.workingHours)!
  for (const s of slots) {
    assert.ok(s.timeLocal >= wh.start, `${s.timeLocal} is before the configured open ${wh.start}`)
    assert.ok(s.timeLocal < wh.end, `${s.timeLocal} is at or after the configured close ${wh.end}`)
    const weekday = DateTime.fromISO(s.startUtc).setZone(cfg.timezone).weekday
    assert.ok(wh.days.includes(weekday), `slot on weekday ${weekday}, not in ${wh.days}`)
  }
})

test('the exact string that reached ZZ TEST is now refused at the door', () => {
  // It passed the old regex — it contains two clock times — and threw inside
  // Luxon once it reached the engine.
  const bad = { ...draft, workingHours: 'Mon–Sat 09:30 – 19:30 whenever suits' }
  assert.equal(parseWorkingHours(bad.workingHours), null)
  assert.ok(validate(bad).some((e) => e.field === 'workingHours'))
})

test('a string working_hours makes the engine THROW, which is why this is a validation gap', () => {
  // The consequence, asserted rather than described: ProposeSlots runs on every
  // inbound message and has no error branch, so this is silence to the lead.
  assert.throws(() =>
    loadEngine()({
      nowISO: '2026-09-07T06:00:00Z',
      tz: 'Europe/Lisbon',
      workingHours: 'Mon–Sat 09:30 – 19:30' as unknown as Record<string, unknown>,
      bookingWindowDays: 14,
      minHoursNotice: 24,
      durationMinutes: 60,
      busy: [],
      maxSlots: 3,
      slotStepMinutes: 60,
    }),
  )
})

test('parseWorkingHours: the forms a real operator types', () => {
  assert.deepEqual(parseWorkingHours('Mon–Sat 09:30 – 19:30'), {
    start: '09:30', end: '19:30', days: [1, 2, 3, 4, 5, 6],
  })
  assert.deepEqual(parseWorkingHours('mon-fri 9:00-18:00'), {
    start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5],
  })
  assert.deepEqual(parseWorkingHours('Tue, Thu, Sat 10:00 - 14:00')!.days, [2, 4, 6])
  assert.deepEqual(parseWorkingHours('Sat–Mon 09:00 – 17:00')!.days, [1, 6, 7], 'a range may wrap the week')
})

test('parseWorkingHours refuses what it cannot honour', () => {
  for (const bad of [
    '',
    'Mon–Sat',                    // no times
    '09:30 – 19:30',              // no days
    'Mon–Blursday 09:00 – 17:00', // not a day
    'Mon–Sat 19:30 – 09:30',      // closes before it opens: no slots, ever
    'Mon–Sat 09:30 – 09:30',      // zero-length day
    'Mon–Sat 25:00 – 26:00',      // not a clock time
  ]) {
    assert.equal(parseWorkingHours(bad), null, `should refuse: ${JSON.stringify(bad)}`)
  }
})
