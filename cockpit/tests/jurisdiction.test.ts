/*
 * Jurisdiction resolution — Stage 1, piece 3.
 *
 * The rule under test: the applicable law is the RECIPIENT's, resolved from the
 * number, and a number that cannot be resolved says WHY rather than returning
 * an absence. Three of these cases would pass against a prefix table; the +1
 * ones would not, and those are the ones that would have reached a real person.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveJurisdiction, toE164, REFUSAL_MEANS, type JurisdictionRefusal } from '../src/lib/jurisdiction'
import { parseCsv } from '../src/lib/import/parse'

function ok(raw: string, country: string, dc?: 'PT' | 'ES' | 'GB') {
  const r = resolveJurisdiction(raw, dc)
  assert.equal(r.ok, true, `${raw} was refused: ${r.ok ? '' : r.reason}`)
  if (r.ok) assert.equal(r.country, country, `${raw} resolved to ${r.country}, expected ${country}`)
}
function refused(raw: string, reason: JurisdictionRefusal) {
  const r = resolveJurisdiction(raw)
  assert.equal(r.ok, false, `${raw} resolved when it should have been refused`)
  if (!r.ok) assert.equal(r.reason, reason, `${raw} refused as ${r.reason}, expected ${reason}`)
}

test('the two jurisdictions that matter today', () => {
  ok('+351912345678', 'PT')
  ok('912345678', 'PT')                 // bare, PT default
  ok('+34600123456', 'ES')
  ok('600123456', 'ES', 'ES')
})

test('+1 is not one country, which is the whole reason this is not a prefix table', () => {
  // Meta blocks marketing templates to +1 at the platform level. A
  // startsWith('+1') would have called every one of these "US" and been
  // invisible until a Canadian or a Dominican number hit a US-only rule.
  ok('+12125550123', 'US')   // New York
  ok('+14165550123', 'CA')   // Toronto — same country code, different country
  ok('+18095550123', 'DO')   // Dominican Republic
  ok('+18685550123', 'TT')   // Trinidad and Tobago
  ok('+13065550123', 'CA')   // Saskatchewan
})

test('other jurisdictions in the §8.3 table resolve to themselves', () => {
  ok('+353871234567', 'IE')
  ok('+4915112345678', 'DE')
  ok('+33612345678', 'FR')
  ok('+31612345678', 'NL')
  ok('+447400123456', 'GB')
  ok('+442079460958', 'GB')
  ok('+5511987654321', 'BR')   // not in the table, and therefore not contactable
})

test('+44 is FOUR jurisdictions, and the mobile ranges are the trap', () => {
  // Guernsey, Jersey and the Isle of Man share the United Kingdom's country
  // code and are NOT part of the UK for data protection purposes -- each has
  // its own authority and its own EU adequacy decision, and PECR does not
  // apply. §8.3 has one "United Kingdom" row, so a +44 number must never be
  // assumed to be governed by it.
  //
  // The dangerous part is that these are MOBILE ranges. 07911 and 07781 read
  // as ordinary British mobiles and are Guernsey; 07797 and 07829 are Jersey.
  // Nothing about them looks foreign.
  ok('+447911123456', 'GG')
  ok('+447781123456', 'GG')
  ok('+447797123456', 'JE')
  ok('+441534123456', 'JE')
  ok('+441624123456', 'IM')
  // And the fail-safe that makes this survivable: a country with no row in the
  // policy table is not contactable, so resolving GG correctly refuses, while
  // resolving it as GB would have applied the wrong country's rules.
})

test('a refusal says WHICH refusal, because one absence cannot mean three things', () => {
  refused('', 'empty')                    // nothing was given
  refused('   ', 'empty')
  refused('9.12346E+11', 'unparseable')    // Excel already ate the digits
  refused('not a phone', 'unparseable')
  refused('+351999', 'invalid')            // readable, not a real number
  refused('+3519123456789012', 'invalid')  // too long for PT
})

test('every refusal reason has operator wording, so a screen can never show a bare code', () => {
  for (const reason of ['empty', 'unparseable', 'invalid', 'no_country'] as JurisdictionRefusal[]) {
    assert.ok(REFUSAL_MEANS[reason]?.length > 20, `${reason} has no usable explanation`)
  }
})

test('empty and unreadable are different facts, as they are for a consent cell', () => {
  // The same distinction readConsentClaim draws: "nothing was said" and "we
  // could not read what was said" are different states of the world, and a
  // system that merges them loses the only information that decides what to do
  // next. Here: an empty phone is a data-entry gap; an unparseable one is a
  // number someone believed they had.
  const a = resolveJurisdiction('')
  const b = resolveJurisdiction('9.12346E+11')
  assert.equal(a.ok, false)
  assert.equal(b.ok, false)
  assert.notEqual(a.ok === false && a.reason, b.ok === false && b.reason)
})

test('toE164 still answers its old question, and there is only one parser', () => {
  // These are the assertions from import-normalise.test.ts, repeated against
  // the module the function now lives in: the re-export must not change
  // behaviour for the callers that already depend on it.
  assert.equal(toE164('+351912345678'), '+351912345678')
  assert.equal(toE164('912345678'), '+351912345678')
  assert.equal(toE164('00351 912 345 678'), '+351912345678')
  assert.equal(toE164('+351-912-345-678'), '+351912345678')
  assert.equal(toE164('+34 600 123 456'), '+34600123456')
  assert.equal(toE164('9.12346E+11'), null)
  assert.equal(toE164('912345678.0'), '+351912345678')
  assert.equal(toE164(''), null)
})

test('INVARIANT: no contact is accepted without a resolved country or a stated reason', () => {
  // Run against the real fixture rather than synthetic input, so the four
  // outcomes each have an example an agency actually produced.
  const csv = readFileSync(new URL('./fixtures/messy-contacts.csv', import.meta.url), 'utf8')
  const rows = parseCsv(csv).rows
  assert.ok(rows.length > 0, 'a vacuous pass over an empty fixture proves nothing (§5c)')

  const seen = new Set<string>()
  for (const row of rows) {
    const raw = String(row.values['Telemóvel'] ?? '')
    const r = resolveJurisdiction(raw)
    if (r.ok) {
      assert.match(r.e164, /^\+[1-9][0-9]{6,14}$/, `${raw} resolved to a non-E.164 string`)
      assert.match(r.country, /^[A-Z]{2}$/, `${raw} resolved to a bad country code`)
      seen.add(`ok:${r.country}`)
    } else {
      assert.ok(REFUSAL_MEANS[r.reason], `${raw} refused with no explanation`)
      seen.add(`no:${r.reason}`)
    }
  }
  // The fixture is only useful if it exercises both halves.
  assert.ok([...seen].some((s) => s.startsWith('ok:')), 'no row resolved')
  assert.ok([...seen].some((s) => s.startsWith('no:')), 'no row was refused')
  console.log('    fixture outcomes:', [...seen].sort().join(' · '))
})
