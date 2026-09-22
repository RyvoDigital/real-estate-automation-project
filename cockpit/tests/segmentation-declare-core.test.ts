/*
 * The consent declaration's write path: /segmentation rebuild, checkpoint 1
 * (22 Sep 2026). Every path through declare-core.ts, with a fake store that
 * behaves like the real one: ONE insert is all rows or none, and it has no
 * other verb.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  declareSegment, resolveDeclaration, buildRows, validateDeclaration, GROUP_CHANGED, UNCHOSEN, NONE_LEFT,
  type DeclarationForm, type DeclarationRow, type DeclareDeps, type DeclareInput, type ServerGroup,
} from '../src/lib/segmentation/declare-core'

/** A store with the real one's shape: one call, all rows or none, insert only. */
function store(opts: { failWith?: string } = {}) {
  const rows: DeclarationRow[] = []
  const calls: number[] = []
  const deps: DeclareDeps = {
    insertAll: async (batch) => {
      calls.push(batch.length)
      if (opts.failWith) return { error: opts.failWith } // a single statement: nothing lands
      rows.push(...batch)
      return { error: null }
    },
    now: () => new Date('2026-09-22T10:00:00Z'),
    newId: () => 'decl-1',
  }
  return { rows, calls, deps }
}

const phone = (i: number) => `+3519${String(10000000 + i)}`
const input = (over: Partial<DeclareInput> = {}): DeclareInput => ({
  clientId: 'c1', contacts: [{ phone: phone(1), leadId: 'l1' }, { phone: phone(2), leadId: 'l2' }],
  segment: 'C', declaredBy: 'Ana Ferreira', recordedBy: 'manuel@ryvodigital.com', basis: null, uncertainty: false,
  group: { id: 'g1', label: 'Importação de 3 Set', size: 2 }, ...over,
})

// ── the write ────────────────────────────────────────────────────────────────

test('🔒 a declaration is ONE insert of every row: kind declared, their person apart from ours', async () => {
  const s = store()
  const r = await declareSegment(input(), s.deps)
  assert.deepEqual(r, { ok: true, written: 2, declarationId: 'decl-1' })
  assert.deepEqual(s.calls, [2])
  for (const row of s.rows) {
    assert.equal(row.kind, 'declared')
    assert.equal(row.source, 'agency_attestation')
    assert.equal(row.segment, 'C')
    assert.equal(row.declared_by, 'Ana Ferreira')
    assert.equal(row.evidence.recorded_by, 'manuel@ryvodigital.com')
    assert.equal(row.evidence.declaration_id, 'decl-1', 'every row of one act carries the same id')
    assert.equal(row.occurred_at, '2026-09-22T10:00:00.000Z')
  }
})

test('🔴 NOTHING HALF-WRITTEN: 450 contacts are still ONE insert (they were three slices of 200 until 22 Sep)', async () => {
  const contacts = Array.from({ length: 450 }, (_, i) => ({ phone: phone(i), leadId: `l${i}` }))
  const ok = store()
  await declareSegment(input({ contacts, group: { id: 'g1', label: 'x', size: 450 } }), ok.deps)
  assert.deepEqual(ok.calls, [450], 'one statement, whatever the size')

  const fails = store({ failWith: 'violates check constraint "consent_events_phone_e164"' })
  const r = await declareSegment(input({ contacts, group: { id: 'g1', label: 'x', size: 450 } }), fails.deps)
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /nothing was recorded: violates check constraint/)
  assert.equal(fails.rows.length, 0, 'a failure leaves no row')
  assert.deepEqual(fails.calls, [450], 'and no second attempt at a remainder')
})

test('🔒 a refusal writes nothing and never reaches the store', async () => {
  for (const bad of [input({ declaredBy: '  ' }), input({ segment: 'E' as 'A' }), input({ segment: 'B', basis: ' ' }), input({ contacts: [], group: null })]) {
    const s = store()
    const r = await declareSegment(bad, s.deps)
    assert.equal(r.ok, false)
    assert.deepEqual(s.calls, [], 'the store was never called')
  }
})

test('🔒 "were they sure?" is required: an unanswered one is refused, never read as sure', () => {
  assert.match(validateDeclaration(input({ uncertainty: undefined as unknown as boolean }))!, /has to be answered, not assumed/)
  assert.equal(buildRows(input({ uncertainty: true }), new Date(), 'x')[0].evidence.uncertainty, true)
})

test('the declarer and the recorder stay two people (unchanged rule, now in the core)', () => {
  assert.match(validateDeclaration(input({ declaredBy: 'manuel@ryvodigital.com' }))!, /the agency declares and we record/i)
})

// ── from the form: never pre-filled, never defaulted ────────────────────────

const GROUP: ServerGroup = { id: 'g1', label: 'Importação de 3 Set', contactIds: ['l1', 'l2', 'l3'] }
const SERVER = { groups: [GROUP], contacts: [1, 2, 3].map((i) => ({ id: `l${i}`, phone: phone(i) })) }
const form = (over: Partial<DeclarationForm> = {}): DeclarationForm => ({
  clientId: 'c1', groupId: 'g1', segment: 'A', declaredBy: 'Ana Ferreira', basis: null, uncertainty: null,
  contacts: ['l1', 'l2', 'l3'], excluded: [], ...over,
})

test('🔴 NEVER DEFAULTED: no origin, an empty one or anything but A–D is refused, never a fallback', () => {
  for (const segment of [null, '', ' ', 'a', 'E', 'A ', 'AB']) {
    const r = resolveDeclaration(form({ segment }), SERVER, 'manuel@ryvodigital.com')
    assert.equal(r.ok, false, `segment ${JSON.stringify(segment)} was accepted`)
  }
  assert.deepEqual(resolveDeclaration(form({ segment: null }), SERVER, 'm'), { ok: false, reason: UNCHOSEN })
})

test('🔴 NEVER PRE-FILLED: the group\'s proposal cannot become the answer', () => {
  // The proposal is on the Group the screen draws; the core's ServerGroup has no such field, so the
  // answer can only be what the form carried. A form with no answer stays refused whatever was proposed.
  const proposed = { ...GROUP, proposal: { segment: 'C', why: 'last contact 2019' } } as ServerGroup
  const r = resolveDeclaration(form({ segment: null }), { ...SERVER, groups: [proposed] }, 'm')
  assert.deepEqual(r, { ok: false, reason: UNCHOSEN })
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'segmentation', 'declare-core.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(src, /proposal/, 'the core reads the proposal somewhere')
})

test('the declarer\'s name is what was typed, trimmed; no name is refused downstream, not filled in', async () => {
  const r = resolveDeclaration(form({ declaredBy: null }), SERVER, 'm')
  assert.equal(r.ok, true)
  const s = store()
  const out = await declareSegment((r as { input: DeclareInput }).input, s.deps)
  assert.equal(out.ok, false)
  assert.deepEqual(s.calls, [])
})

test('🔒 what is declared is what was on the screen: a group that changed since is refused', () => {
  assert.deepEqual(resolveDeclaration(form({ contacts: ['l1', 'l2'] }), SERVER, 'm'), { ok: false, reason: GROUP_CHANGED })
  assert.deepEqual(resolveDeclaration(form({ contacts: ['l1', 'l2', 'l3', 'l9'] }), SERVER, 'm'), { ok: false, reason: GROUP_CHANGED }, 'a contact added in the browser')
  assert.deepEqual(resolveDeclaration(form({ excluded: ['l9'] }), SERVER, 'm'), { ok: false, reason: GROUP_CHANGED }, 'an exclusion from outside the group')
  const gone = { ...SERVER, contacts: SERVER.contacts.slice(0, 2) }
  assert.deepEqual(resolveDeclaration(form(), gone, 'm'), { ok: false, reason: GROUP_CHANGED }, 'a member the server can no longer read')
})

test('exclusions come out; the label and the size are the server\'s; the recorder is the session\'s', () => {
  const r = resolveDeclaration(form({ excluded: ['l2'], segment: 'B', basis: '  Formulário do site, 2024 ' }), SERVER, 'manuel@ryvodigital.com')
  assert.equal(r.ok, true)
  const i = (r as { input: DeclareInput }).input
  assert.deepEqual(i.contacts, [{ phone: phone(1), leadId: 'l1' }, { phone: phone(3), leadId: 'l3' }])
  assert.deepEqual(i.group, { id: 'g1', label: 'Importação de 3 Set', size: 2 })
  assert.equal(i.recordedBy, 'manuel@ryvodigital.com')
  assert.equal(i.basis, 'Formulário do site, 2024')
  assert.deepEqual(resolveDeclaration(form({ excluded: ['l1', 'l2', 'l3'] }), SERVER, 'm'), { ok: false, reason: NONE_LEFT })
  assert.equal(resolveDeclaration(form({ groupId: 'nope' }), SERVER, 'm').ok, false)
})

test('the checkbox as it stands: ticked is unsure; untouched records sure (the default checkpoint 2 removes)', () => {
  const on = resolveDeclaration(form({ uncertainty: 'on' }), SERVER, 'm') as { input: DeclareInput }
  const off = resolveDeclaration(form({ uncertainty: null }), SERVER, 'm') as { input: DeclareInput }
  assert.equal(on.input.uncertainty, true)
  assert.equal(off.input.uncertainty, false)
})

// ── append-only, across the whole cockpit ───────────────────────────────────

test('🔒 nothing in the cockpit updates, upserts or deletes a consent event', () => {
  const root = join(import.meta.dirname, '..', 'src')
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      const text = readFileSync(p, 'utf8')
      // Each `.from('consent_events')` chain: the rest of its line, then every following line that
      // continues it with a leading `.` (this codebase has no semicolons to end a statement on).
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        const at = line.search(/from\(\s*['"]consent_events['"]\s*\)/)
        if (at < 0) return
        let chain = line.slice(at)
        for (let j = i + 1; j < lines.length && /^\s*\./.test(lines[j]); j++) chain += lines[j]
        if (/\.(update|upsert|delete)\s*\(/.test(chain)) offenders.push(`${p}:${i + 1}: ${chain.trim().slice(0, 80)}`)
      })
    }
  }
  walk(root)
  assert.deepEqual(offenders, [])
})

test('🔒 the core cannot write any other way: its store has one verb, and it imports no database', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'segmentation', 'declare-core.ts'), 'utf8')
  assert.doesNotMatch(src, /supabase|admin\(|server-only/, 'the core reaches a database itself')
  // The TYPE, read from the source: a fake's keys would only test the fake.
  const block = src.match(/export type DeclareDeps = \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const members = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/^\s*(\w+)\s*\(/gm)].map((m) => m[1]).sort()
  assert.deepEqual(members, ['insertAll', 'newId', 'now'])
})
