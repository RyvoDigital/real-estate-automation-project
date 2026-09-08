import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectFormat, parseFile, parseVcard, parseXlsx } from '../src/lib/import/parse'
import { planImport } from '../src/lib/import/plan'
import type { Mapping } from '../src/lib/import/types'

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url))

test('format detection does not trust the extension', async () => {
  const xlsx = read('messy-contacts.xlsx')
  assert.equal(detectFormat('contacts.xlsx', xlsx), 'xlsx')
  // An agency renames a file all the time. XLSX is a zip and says so.
  assert.equal(detectFormat('contacts.csv', xlsx), 'xlsx')
  assert.equal(detectFormat('anything', read('contacts.vcf')), 'vcard')
  assert.equal(detectFormat('list.csv', read('messy-contacts.csv')), 'csv')
})

test('xlsx: the cell types that are not strings', async () => {
  const p = await parseXlsx(read('messy-contacts.xlsx'))
  const v = (i: number) => p.rows[i].values

  // Rich text — a name with one bold word is an array of runs, and a naive
  // reader stores "[object Object]" as somebody's name.
  assert.equal(v(0)['Nome'], 'Ana Ferreira')
  // A hyperlinked email carries a label and a mailto:.
  assert.equal(v(0)['Email'], 'ana@example.com')
  // Excel hands back a real Date, not the text the human sees.
  assert.equal(v(0)['Último Contacto'], '2026-04-15')
  // A formula cell carries its computed result — that is what Excel displays.
  assert.equal(v(1)['Orçamento'], '1200000')
  // #REF! is a spreadsheet error, not a value.
  assert.equal(v(2)['Orçamento'], '')
})

test('xlsx: a second sheet is reported rather than silently ignored', async () => {
  const p = await parseXlsx(read('messy-contacts.xlsx'))
  assert.match(p.note ?? '', /2 sheets.*Contactos/)
})

test('xlsx: line numbers are worksheet rows', async () => {
  const p = await parseXlsx(read('messy-contacts.xlsx'))
  assert.deepEqual(p.rows.map((r) => r.line), [2, 3, 4])
})

test('vcard: LF endings, repeated TEL, and a card that will not parse', () => {
  const p = parseVcard(read('contacts.vcf').toString('utf8'))
  assert.equal(p.rows.length, 3)
  assert.equal(p.rows[0].values.name, 'Sofia Marques')
  assert.equal(p.rows[0].values.phone, '+351 916 000 111')
  assert.equal(p.rows[0].values.phone_2, '+351 211 000 111', 'a second TEL is kept, not dropped')
  assert.match(p.rows[0].values.note, /garden/)
})

test('a vCard flows through the same planner as a spreadsheet', async () => {
  const p = await parseFile('contacts.vcf', read('contacts.vcf'))
  const mapping: Mapping = { name: 'full_name', phone: 'phone', email: 'email', note: 'notes' }
  const { candidates, report } = planImport(p.rows, mapping, { defaultCountry: 'PT' })

  assert.equal(candidates[0].phone, '+351916000111')
  assert.equal(candidates[1].phone, '+351916000222', 'a bare national number, defaulted to PT')

  // "not-a-number" is not reachable, so the card is REFUSED with its reason
  // rather than stored as a lead nobody can contact. An earlier version of this
  // test asserted both that it was kept and that nothing was rejected, which
  // cannot both be true — the test was wrong, not the planner.
  assert.equal(candidates.length, 2)
  assert.equal(report.rejected.length, 1)
  assert.equal(report.rejected[0].row, 3)
  assert.match(report.rejected[0].reason, /could not be read as a number/)
  assert.equal(
    candidates.find((c) => c.full_name === 'Broken Card'),
    undefined,
    'an unreachable contact must not land as a lead',
  )
})
