import test from 'node:test'
import assert from 'node:assert/strict'

import {
  RESOLUTION_MEANS, resolveRequirements,
  type PolicyRow, type Requirement,
} from '../src/lib/publication/requirements'

/**
 * Resolving what a jurisdiction requires — the level beneath the country.
 *
 * The cases that matter are the asymmetry (an absent country refuses, an absent
 * region does not, and only because somebody enumerated them) and the two
 * Spanish shapes that broke the old design: a Barcelona property carrying a
 * requirement a Zaragoza property does not, and a requirement that becomes
 * effective on a date.
 */

const NOW = new Date('2026-09-18T12:00:00Z')
const confirmed = { confirmed_at: '2026-09-01T00:00:00Z', confirmed_by: 'M. de Sousa Pereira' }

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  id, kind: 'agency_registration', ...over,
})

const row = (over: Partial<PolicyRow> = {}): PolicyRow => ({
  country: 'ES',
  region: null,
  requires: [],
  regions_exhaustive: false,
  region_required: false,
  confirmed_at: null,
  confirmed_by: null,
  ...over,
})

// --- the country level ------------------------------------------------------

test('a country we have not analysed refuses', () => {
  const r = resolveRequirements({ country: 'FR', region: null, rows: [], now: NOW })
  assert.equal(r.resolved, false)
  if (r.resolved) return
  assert.equal(r.reason, 'no_policy_row')
})

test('🔴 a researched but unconfirmed country permits nothing', () => {
  // The same posture 0014 takes. What is in doubt is OUR ENCODING of the
  // obligations, not the obligations — and the flag exists to record exactly
  // that difference. Portugal is seeded this way on purpose.
  const r = resolveRequirements({
    country: 'PT', region: null,
    rows: [row({ country: 'PT', requires: [req('pt_ami')], regions_exhaustive: true })],
    now: NOW,
  })
  assert.equal(r.resolved, false)
  if (r.resolved) return
  assert.equal(r.reason, 'policy_not_confirmed')
  assert.match(r.detail, /our encoding/, 'it says what is actually in doubt')
})

test('a confirmed country resolves its national requirements', () => {
  const r = resolveRequirements({
    country: 'PT', region: null,
    rows: [row({ country: 'PT', requires: [req('pt_ami'), req('pt_energy_class', { kind: 'property_rating' })],
                regions_exhaustive: true, ...confirmed })],
    now: NOW,
  })
  assert.equal(r.resolved, true)
  if (!r.resolved) return
  assert.deepEqual(r.requirements.map((x) => x.id), ['pt_ami', 'pt_energy_class'])
})

// --- 🔴 the level beneath the country ---------------------------------------

test('🔴 Barcelona carries a requirement Zaragoza does not', () => {
  // The case the old shape could not express at all.
  const rows = [
    row({ requires: [req('es_energy_label', { kind: 'property_rating' })],
          region_required: true, regions_exhaustive: true, ...confirmed }),
    row({ region: 'CT', requires: [req('es_cat_aicat')], ...confirmed }),
  ]
  const barcelona = resolveRequirements({ country: 'ES', region: 'CT', rows, now: NOW })
  const zaragoza = resolveRequirements({ country: 'ES', region: 'AR', rows, now: NOW })

  assert.equal(barcelona.resolved, true)
  assert.equal(zaragoza.resolved, true)
  if (!barcelona.resolved || !zaragoza.resolved) return
  assert.deepEqual(barcelona.requirements.map((x) => x.id), ['es_energy_label', 'es_cat_aicat'])
  assert.deepEqual(zaragoza.requirements.map((x) => x.id), ['es_energy_label'],
    'Aragón genuinely has no agency register; demanding one refuses a LAWFUL advertisement')
})

test('🔴 a region we do not recognise refuses UNLESS somebody enumerated them', () => {
  // The whole safety of the asymmetry. Without the flag, an unknown region is a
  // refusal; with it, a person has taken responsibility for the list and a
  // lawyer confirmed it.
  const notEnumerated = [row({ requires: [req('es_energy_label')], region_required: true, ...confirmed })]
  const r = resolveRequirements({ country: 'ES', region: 'AR', rows: notEnumerated, now: NOW })
  assert.equal(r.resolved, false)
  if (r.resolved) return
  assert.equal(r.reason, 'region_not_enumerated')
  assert.match(r.detail, /AR/, 'it names the region, or nobody can act on it')

  const enumerated = [row({ ...notEnumerated[0], regions_exhaustive: true })]
  assert.equal(resolveRequirements({ country: 'ES', region: 'AR', rows: enumerated, now: NOW }).resolved, true)
})

test('🔴 a country that regulates regionally refuses a property with no region', () => {
  // Deny by default, and NEVER a guess from the town name: deciding a region
  // applies a legal requirement or removes one.
  const rows = [row({ requires: [req('es_energy_label')], region_required: true,
                      regions_exhaustive: true, ...confirmed })]
  const r = resolveRequirements({ country: 'ES', region: null, rows, now: NOW })
  assert.equal(r.resolved, false)
  if (r.resolved) return
  assert.equal(r.reason, 'region_undeclared')
  assert.match(r.detail, /guess with a citation/, 'the reason is stated where it will be read')
})

test('Portugal does not regulate regionally, so a null region is fine', () => {
  const r = resolveRequirements({
    country: 'PT', region: null,
    rows: [row({ country: 'PT', requires: [req('pt_ami')], regions_exhaustive: true, ...confirmed })],
    now: NOW,
  })
  assert.equal(r.resolved, true)
})

test('an unconfirmed REGION row refuses rather than being dropped', () => {
  // Silently ignoring it would publish under a rule somebody wrote and nobody
  // checked — which is worse than refusing, because it looks like it worked.
  const rows = [
    row({ requires: [req('es_energy_label')], regions_exhaustive: true, ...confirmed }),
    row({ region: 'CT', requires: [req('es_cat_aicat')] }),
  ]
  const r = resolveRequirements({ country: 'ES', region: 'CT', rows, now: NOW })
  assert.equal(r.resolved ? '' : r.reason, 'policy_not_confirmed')
})

// --- requirements have dates, because Madrid is changing --------------------

test('🔴 a requirement that is not yet effective is not required yet', () => {
  // Madrid announced in June 2026 that registration becomes mandatory. The set
  // is resolved AS OF NOW, so the row can be written once and become true on a
  // date without anybody editing it that day.
  const rows = [
    row({ requires: [], regions_exhaustive: true, ...confirmed }),
    row({ region: 'MD', requires: [req('es_mad_registro', { effective_from: '2027-01-01' })], ...confirmed }),
  ]
  const today = resolveRequirements({ country: 'ES', region: 'MD', rows, now: NOW })
  const later = resolveRequirements({ country: 'ES', region: 'MD', rows, now: new Date('2027-06-01') })

  assert.deepEqual(today.resolved ? today.requirements : null, [])
  assert.deepEqual(later.resolved ? later.requirements.map((x) => x.id) : null, ['es_mad_registro'])
})

test('a requirement that has lapsed stops being required, on the same day rule', () => {
  const rows = [row({ requires: [req('old', { effective_until: '2026-09-18' })],
                      regions_exhaustive: true, ...confirmed })]
  // Valid THROUGH the day it lapses — the same end-of-day convention the gate
  // and the re-check both use, so three parts of one feature cannot disagree.
  //
  // ⚠️ The first version of this assertion read `resolved ? ['old'] : []` and
  // therefore only checked that resolution SUCCEEDED — which it does either
  // way, because an empty requirement set still resolves. The end-of-day rule
  // was untested, and the sabotage that should have caught it broke nothing.
  // Lesson 1l, on this file's own author.
  const onTheDay = resolveRequirements({ country: 'ES', region: null, rows, now: NOW })
  assert.equal(onTheDay.resolved, true)
  assert.deepEqual(onTheDay.resolved ? onTheDay.requirements.map((x) => x.id) : null, ['old'],
    'still required on the day it lapses, like every other date in this system')
  const after = resolveRequirements({ country: 'ES', region: null, rows, now: new Date('2026-09-20') })
  assert.deepEqual(after.resolved ? after.requirements : null, [])
})

// --- the words --------------------------------------------------------------

test('every refusal says what it means, and none of them says "invalid"', () => {
  for (const [reason, means] of Object.entries(RESOLUTION_MEANS)) {
    assert.ok(means.length > 80, `${reason} is too short to act on`)
    assert.doesNotMatch(means, /invalid|error|failed|null/i, reason)
  }
})
