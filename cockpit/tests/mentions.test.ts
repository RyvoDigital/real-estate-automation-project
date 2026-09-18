import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { RENDERABLE, UnrenderableRequirement, mentionsFor } from '../src/lib/publication/mentions'
import type { SatisfiedRequirement } from '../src/lib/publication/gate'

/**
 * Every requirement a jurisdiction row declares must have words.
 *
 * The registry throws on an id it cannot say, which is right — but that only
 * fires when somebody prepares a piece. The failure to design out is a
 * jurisdiction SEEDED without wording: the row exists, the gate clears a
 * property against it, and the piece explodes in front of an agency.
 *
 * So this reads the migrations and asserts the two lists agree.
 */

const REPO = resolve(new URL('../..', import.meta.url).pathname)

/** Every requirement id any migration seeds into advertising_policy. */
function seededRequirementIds(): string[] {
  const dir = resolve(REPO, 'db/migrations')
  const ids = new Set<string>()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sql')) continue
    const sql = readFileSync(resolve(dir, f), 'utf8')
    // Only inside an advertising_policy insert — a requirement id mentioned in
    // a comment elsewhere is not a seeded requirement.
    if (!/insert\s+into\s+public\.advertising_policy/i.test(sql)) continue
    for (const m of sql.matchAll(/"id"\s*:\s*"([a-z0-9_]+)"/g)) ids.add(m[1])
  }
  return [...ids].sort()
}

test('the check can see the migrations it is reading', () => {
  // §5c: an empty list passes every assertion below perfectly.
  const ids = seededRequirementIds()
  assert.ok(ids.length >= 2, `found ${ids.length} seeded requirement ids — did the seed move?`)
  assert.ok(ids.includes('pt_energy_class') && ids.includes('pt_ami'))
})

test('🔴 every requirement a migration seeds has wording', () => {
  const missing = seededRequirementIds().filter((id) => !RENDERABLE.includes(id))
  assert.deepEqual(
    missing, [],
    'These requirements are seeded into advertising_policy and cannot be said out loud:\n\n' +
    missing.map((id) => `  • ${id}`).join('\n') +
    '\n\nA piece prepared for a property in that jurisdiction would throw in front of an agency.\n' +
    'Add a renderer in src/lib/publication/mentions.ts.\n',
  )
})

test('🔴 an id with no renderer throws, and names itself', () => {
  const r: SatisfiedRequirement = {
    requirementId: 'es_energy_label', kind: 'property_rating',
    values: { emissions: 'D' }, number: null, validUntil: '2031-01-01', exemption: null,
  }
  assert.throws(() => mentionsFor([r]), UnrenderableRequirement)
  assert.throws(() => mentionsFor([r]), /es_energy_label/)
  // And it says what to do, because the person hitting this is mid-task.
  assert.throws(() => mentionsFor([r]), /mentions\.ts/)
})

test('the Portuguese wordings are what an advertisement must carry', () => {
  const rating: SatisfiedRequirement = {
    requirementId: 'pt_energy_class', kind: 'property_rating',
    values: { class: 'B' }, number: null, validUntil: '2031-01-01', exemption: null,
  }
  const ami: SatisfiedRequirement = {
    requirementId: 'pt_ami', kind: 'agency_registration',
    values: {}, number: 'AMI 12345', validUntil: null, exemption: null,
  }
  assert.deepEqual(mentionsFor([rating, ami]).map((m) => m.text),
    ['Classe energética: B.', 'AMI 12345'])
})

test('an exemption says it is exempt, and never claims a rating', () => {
  const r: SatisfiedRequirement = {
    requirementId: 'pt_energy_class', kind: 'property_rating',
    values: {}, number: null, validUntil: null,
    exemption: { declared_by: 'A. Ferreira', basis: 'Em ruína', at: '2026-09-18' },
  }
  const text = mentionsFor([r])[0].text
  assert.match(text, /isento/)
  assert.doesNotMatch(text, /Classe energética/)
})
