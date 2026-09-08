import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv } from '../src/lib/import/parse'
import { planImport } from '../src/lib/import/plan'
import type { Mapping } from '../src/lib/import/types'

/*
 * Gate F1's proof, as a test rather than a demonstration: a deliberately messy
 * spreadsheet — inconsistent headers, duplicates in three different disguises,
 * five phone conventions, an unescaped comma, a contact with no way to reach
 * them — has to produce an HONEST report of what landed and what did not.
 *
 * The assertions are on the REJECTS, not on the accepted rows. A dropped row
 * that nobody names is indistinguishable from a row that was never there, and
 * that is the whole failure mode this gate exists to prevent.
 */

const csv = readFileSync(new URL('./fixtures/messy-contacts.csv', import.meta.url), 'utf8')

const mapping: Mapping = {
  'Nome Completo': 'full_name',
  'Telemóvel': 'phone',
  'E-mail': 'email',
  'Budget Range': 'budget_range',
  'Zona': 'area',
  'Tipologia': 'bedrooms',
  'Notes': 'notes',
  'Consentimento': 'consent',
  'Último Contacto': 'last_contact_at',
}

function run() {
  const parsed = parseCsv(csv)
  return {
    parsed,
    ...planImport(parsed.rows, mapping, {
      defaultCountry: 'PT',
      existingPhones: new Set(['+351933048230']), // a lead this client already has
      parseErrors: parsed.parseErrors.map((e) => ({ row: e.row, reason: e.reason, raw: {} })),
    }),
  }
}

test('the header row survives a BOM, an accent and a trailing space', () => {
  const { parsed } = run()
  assert.ok(parsed.headers.includes('Telemóvel'))
  assert.ok(parsed.headers.includes('E-mail'), 'a trailing space in a header is trimmed')
})

test('the unescaped comma is REJECTED, by row number, with a reason', () => {
  const { report } = run()
  const bad = report.rejected.find((r) => /comma/i.test(r.reason))
  assert.ok(bad, 'the misaligned row must be named, not silently imported misaligned')
  assert.equal(bad!.row, 7)
})

/*
 * THE ROW NUMBERS ARE THE REPORT.
 *
 * A rejected row shifts every later array index by one, so a report numbered by
 * position sends the operator to the wrong line of their own spreadsheet — and
 * the whole value of "53 rows did not land" is that they can go and look at
 * them. This was green in all the tests above and wrong in the output; it was
 * found by printing the report, not by asserting on it.
 *
 * Every number below is the literal line of messy-contacts.csv.
 */
test('every reported line number is the real line in the file', () => {
  const { report, candidates } = run()

  const noContact = report.rejected.find((r) => /no phone and no email/.test(r.reason))!
  assert.equal(noContact.row, 8, 'Sem Contacto is on line 8, after the rejected line 7')

  const excel = report.rejected.find((r) => /9\.12346E\+11/.test(r.reason))!
  assert.equal(excel.row, 9, 'Excel Damage is on line 9')

  assert.equal(report.duplicatesInFile.find((d) => d.on === 'phone')!.row, 4)
  assert.equal(report.duplicatesInFile.find((d) => d.on === 'phone')!.matches, 2)
  assert.equal(report.duplicatesInFile.find((d) => d.on === 'email')!.row, 5)
  assert.equal(report.duplicatesAgainstExisting[0].row, 12, 'Manuel Vale is the last line')

  assert.equal(candidates.find((c) => c.phone === '+34600123456')!.row, 11, 'Lucía is on line 11')
})

test('a contact with no phone and no email is rejected and says which', () => {
  const { report } = run()
  const r = report.rejected.find((x) => /no phone and no email/.test(x.reason))
  assert.ok(r, 'a row we cannot reach is not a lead')
})

test('Excel scientific notation is refused rather than guessed at', () => {
  const { report } = run()
  const r = report.rejected.find((x) => /9\.12346E\+11/.test(x.reason))
  assert.ok(r, 'the destroyed number must be reported')
  assert.match(r!.reason, /could not be read as a number/)
})

test('duplicates are caught across format, across case, and against existing leads', () => {
  const { report } = run()
  const phoneDup = report.duplicatesInFile.find((d) => d.on === 'phone')
  assert.ok(phoneDup, '912345678 is the same person as +351 912 345 678')
  assert.equal(phoneDup!.value, '+351912345678')

  const emailDup = report.duplicatesInFile.find((d) => d.on === 'email')
  assert.ok(emailDup, 'MARIA@EXAMPLE.COM is the same person as maria@example.com')

  assert.equal(report.duplicatesAgainstExisting.length, 1)
  assert.equal(report.duplicatesAgainstExisting[0].value, '+351933048230')
})

test('every received row is accounted for — nothing vanishes', () => {
  const { report } = run()
  const accountedFor =
    report.accepted +
    report.rejected.length +
    report.duplicatesInFile.length +
    report.duplicatesAgainstExisting.length
  assert.equal(
    accountedFor,
    report.received,
    `received ${report.received} but only accounted for ${accountedFor} — a row went missing`,
  )
})

test('a budget with no scale is left null rather than stored as 1.5 euros', () => {
  const { candidates } = run()
  const placeholder = candidates.find((c) => c.phone === '+351914222333')
  assert.ok(placeholder)
  assert.equal(placeholder!.budget_min, null)
  assert.equal(placeholder!.full_name, null, '"n/a" is a placeholder, not a name')
  assert.equal(placeholder!.consent_status, 'unknown', '"maybe" is not consent')
})

test('the typology, the range and the Spanish row all read correctly', () => {
  const { candidates } = run()
  const maria = candidates.find((c) => c.phone === '+351912345678')!
  assert.equal(maria.budget_min, 1_800_000)
  assert.equal(maria.budget_max, 2_000_000)
  assert.equal(maria.bedrooms, 4, 'T4')
  assert.equal(maria.consent_status, 'opt_in')
  assert.equal(maria.last_contact_at, '2026-04-15')

  const lucia = candidates.find((c) => c.phone === '+34600123456')!
  assert.equal(lucia.budget_min, 800_000)
  assert.equal(lucia.budget_max, 1_100_000)
  assert.equal(lucia.bedrooms, 3, '3 dorm.')
  assert.equal(lucia.consent_status, 'opt_in', 'sí')
})

test('the tier is reported per row, not asserted over the list', () => {
  const { report, candidates } = run()
  // Henrik has budget + area + criteria; the placeholder row has none of it.
  assert.equal(candidates.find((c) => c.phone === '+351913111222')!.tier, 'precise')
  assert.equal(candidates.find((c) => c.phone === '+351914222333')!.tier, 'approximate')
  assert.ok(report.fieldCoverage._tier_precise >= 3)
  assert.equal(
    report.fieldCoverage._tier_precise +
      report.fieldCoverage._tier_approximate +
      report.fieldCoverage._tier_contact_only,
    report.accepted,
  )
})
