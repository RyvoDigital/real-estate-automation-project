import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCsv } from '../src/lib/import/parse'
import { proposeMapping } from '../src/lib/import/propose'

const parsed = parseCsv(readFileSync(new URL('./fixtures/messy-contacts.csv', import.meta.url), 'utf8'))

test('Portuguese headers are recognised', () => {
  const p = proposeMapping(parsed.headers, parsed.rows)
  const t = (c: string) => p.columns.find((x) => x.column === c)!.target
  assert.equal(t('Nome Completo'), 'full_name')
  assert.equal(t('Telemóvel'), 'phone')
  assert.equal(t('E-mail'), 'email')
  assert.equal(t('Zona'), 'area')
  assert.equal(t('Tipologia'), 'bedrooms')
  assert.equal(t('Consentimento'), 'consent')
  assert.equal(t('Último Contacto'), 'last_contact_at')
})

test('a general word inside a specific header does not steal it', () => {
  // "Último Contacto" is a date and contains "contacto". A greedy phone
  // pattern claimed it once; this is the regression.
  const p = proposeMapping(['Último Contacto', 'Telemóvel', 'Contacto'], [
    { line: 2, values: { 'Último Contacto': '15/04/2026', 'Telemóvel': '+351912345678', 'Contacto': '+351912345678' } },
    { line: 3, values: { 'Último Contacto': '03/02/2026', 'Telemóvel': '+351912345679', 'Contacto': '+351912345679' } },
  ])
  const t = (c: string) => p.columns.find((x) => x.column === c)!.target
  assert.equal(t('Último Contacto'), 'last_contact_at')
  assert.equal(t('Telemóvel'), 'phone')
  // A column called just "Contacto" is genuinely ambiguous, so the VALUES
  // decide it rather than a guess from the word.
  assert.equal(t('Contacto'), 'phone')
  assert.match(p.columns.find((x) => x.column === 'Contacto')!.why, /look like phone numbers/)
})

test('a useless header is decided by its VALUES — §2.3', () => {
  // The case the spec calls out: the header tells you nothing.
  const csv = [
    'Coluna1,Coluna2,Coluna3,Coluna4',
    'Maria Santos,+351 912 345 678,maria@example.com,15/04/2026',
    'João Silva,+351 912 345 679,joao@example.com,03/02/2026',
    'Ana Costa,+351 912 345 680,ana@example.com,20/01/2026',
  ].join('\n')
  const p2 = parseCsv(csv)
  const prop = proposeMapping(p2.headers, p2.rows)
  const t = (c: string) => prop.columns.find((x) => x.column === c)!
  assert.equal(t('Coluna2').target, 'phone')
  assert.match(t('Coluna2').why, /look like phone numbers/)
  assert.equal(t('Coluna3').target, 'email')
  assert.equal(t('Coluna4').target, 'last_contact_at')
})

test('a column of sentences is proposed as notes, not ignored', () => {
  const p = proposeMapping(parsed.headers, parsed.rows)
  const notes = p.columns.find((x) => x.column === 'Notes')!
  assert.equal(notes.target, 'notes')
})

test('every proposal carries its reason and its samples', () => {
  const p = proposeMapping(parsed.headers, parsed.rows)
  for (const c of p.columns) {
    assert.ok(c.why.length > 0, `${c.column} must say why`)
    assert.ok(Array.isArray(c.samples))
  }
})
