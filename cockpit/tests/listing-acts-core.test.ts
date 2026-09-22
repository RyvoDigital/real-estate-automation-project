/*
 * The listing screens' two writes, checkpoint 1 (22 Sep 2026): the exemption
 * and the agent's pick, each a pure core over one 0057 function. Fakes behave
 * like the functions: one call, all or nothing, the named refusals.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { recordExemptionAct, ONE_EXEMPTION_KEY, ONE_CURRENT_FACT, justDeclared, NO_ID as EX_NO_ID, type ExemptionDeps, type ExemptionForm } from '../src/lib/publication/exemption-core'
import { recordPick, ONE_PICK_KEY, ONE_CURRENT_MATCH, justChosen, NO_ID, NO_NAME, SAME_PERSON, AREAS_UNREAD, OTHER_AGENCY, type PickDeps, type PickForm } from '../src/lib/matching/pick-core'

const ID = '11111111-2222-4333-8444-555555555555'
const ME = 'manuelvale@ryvodigital.com'

// ── the exemption ────────────────────────────────────────────────────────────

function exStore(behaviour: 'ok' | 'rated' | 'dup' | 'other' = 'ok', declarer: string | null | 'throws' = null) {
  const calls: Record<string, string>[] = []
  const deps: ExemptionDeps = {
    currentDeclarer: async () => { if (declarer === 'throws') throw new Error('down'); return declarer },
    record: async (args) => {
      calls.push(args)
      if (behaviour === 'rated') return { error: { code: 'RY001', message: 'record_exemption: this property already holds a rating' } }
      if (behaviour === 'dup') return { error: { code: '23505', message: `duplicate key value violates unique constraint "${ONE_EXEMPTION_KEY}"` } }
      if (behaviour === 'other') return { error: { code: '23505', message: 'duplicate key value violates unique constraint "listing_facts_current"' } }
      return { error: null }
    },
  }
  return { deps, calls }
}
const exForm = (over: Partial<ExemptionForm> = {}): ExemptionForm => ({
  exemptionId: ID, listingId: 'l1', requirementId: 'pt_energy_class', declaredBy: 'Marta Soares',
  basis: 'Edifício anterior a 1951, sem obras de fundo', ...over,
})

test('🔒 an exemption is ONE call with both people and their words', async () => {
  const s = exStore()
  assert.deepEqual(await recordExemptionAct(exForm(), ME, s.deps), { ok: true, alreadyRecorded: false })
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0].p_declared_by, 'Marta Soares')
  assert.equal(s.calls[0].p_recorded_by, ME)
})

test('🔴 an exemption over a rating is refused in the rule\'s own words (RY001, decided under the lock)', async () => {
  const r = await recordExemptionAct(exForm(), ME, exStore('rated').deps)
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /already has an energy rating/)
})

test('the same exemption form again is "already recorded"; any other duplicate is a failure', async () => {
  assert.deepEqual(await recordExemptionAct(exForm(), ME, exStore('dup').deps), { ok: true, alreadyRecorded: true })
  const other = await recordExemptionAct(exForm(), ME, exStore('other').deps)
  assert.equal(other.ok, false)
  assert.notEqual((other as { reason: string }).reason, undefined)
})

test('🔴 BY CONSTRAINT NAME: a racing second exemption form is "someone else just recorded this", named when readable', async () => {
  const race = (who: string | null | 'throws') => {
    const s = exStore('ok', who)
    s.deps.record = async () => ({ error: { code: '23505', message: `duplicate key value violates unique constraint "${ONE_CURRENT_FACT}"` } })
    return recordExemptionAct(exForm(), ME, s.deps)
  }
  assert.deepEqual(await race('Rui Antunes'), { ok: false, reason: justDeclared('Rui Antunes') })
  assert.match(justDeclared('Rui Antunes'), /^Rui Antunes just recorded/)
  assert.deepEqual(await race(null), { ok: false, reason: justDeclared(null) })
  assert.deepEqual(await race('throws'), { ok: false, reason: justDeclared(null) }, 'an unreadable name still gives the sentence')
  assert.match(justDeclared(null), /^Someone else just recorded/)
})

test('🔒 THE AGENCY DECLARES, WE RECORD: our email or our NAME as the declarer is refused before the store', async () => {
  for (const declaredBy of [ME, 'Manuel Vale', ' manuel vale ']) {
    const s = exStore()
    const r = await recordExemptionAct(exForm({ declaredBy }), ME, s.deps)
    assert.equal(r.ok, false, `${declaredBy} was accepted as the agency's person`)
    assert.equal(s.calls.length, 0)
  }
})

test('an exemption with no id, no requirement, no name or a non-reason is refused before the store', async () => {
  for (const [over, re] of [[{ exemptionId: 'x' }, EX_NO_ID], [{ requirementId: '' }, /requirement/], [{ declaredBy: '' }, /person at the agency/], [{ basis: 'isento' }, /too short/]] as const) {
    const s = exStore()
    const r = await recordExemptionAct(exForm(over as Partial<ExemptionForm>), ME, s.deps)
    assert.equal(r.ok, false)
    assert.match((r as { reason: string }).reason, typeof re === 'string' ? new RegExp(re.slice(0, 20)) : re)
    assert.equal(s.calls.length, 0)
  }
})

// ── the pick ─────────────────────────────────────────────────────────────────

function pickStore(opts: { areas?: string[] | null; error?: { code: string; message: string }; data?: string; chooser?: string | null | 'throws' } = {}) {
  const calls: Parameters<PickDeps['record']>[0][] = []
  const deps: PickDeps = {
    knownAreas: async () => (opts.areas === undefined ? ['Cascais', 'Estoril'] : opts.areas),
    currentChooser: async () => { if (opts.chooser === 'throws') throw new Error('down'); return opts.chooser ?? null },
    record: async (args) => { calls.push(args); return { data: opts.error ? null : (opts.data ?? 'recorded'), error: opts.error ?? null } },
  }
  return { deps, calls }
}
const pickForm = (over: Partial<PickForm> = {}): PickForm => ({
  pickId: ID, listingId: 'l1', leadId: 'd1', chosenBy: 'Marta Soares', reason: 'Quer uma casa em Cascais com jardim', ...over,
})

test('🔒 a pick is ONE call: the match and what its sentence taught, together', async () => {
  const s = pickStore()
  const r = await recordPick(pickForm(), ME, s.deps)
  assert.equal(r.ok && !r.alreadyRecorded && r.learned > 0, true)
  assert.equal(s.calls.length, 1)
  assert.ok(s.calls[0].p_requirements.some((q) => q.kind === 'area'), 'the area the agent named is learned in the same call')
  assert.equal(s.calls[0].p_chosen_by, 'Marta Soares')
})

test('🔴 a contact the engine already matched can be chosen: the core reports the supersession', async () => {
  const r = await recordPick(pickForm(), ME, pickStore({ data: 'superseded_computed' }).deps)
  assert.equal(r.ok && !r.alreadyRecorded && r.supersededComputed, true)
})

test('🔴 another agency\'s contact is refused in words (RY002); an already-chosen one names who chose it (RY003)', async () => {
  assert.deepEqual(await recordPick(pickForm(), ME, pickStore({ error: { code: 'RY002', message: 'record_agent_pick: this contact belongs to another agency' } }).deps), { ok: false, reason: OTHER_AGENCY })
  const r = await recordPick(pickForm(), ME, pickStore({ error: { code: 'RY003', message: 'record_agent_pick: Rui Antunes already chose this contact for this property. Nothing new was recorded.' } }).deps)
  assert.deepEqual(r, { ok: false, reason: 'Rui Antunes already chose this contact for this property. Nothing new was recorded.' })
})

test('the same pick form again is "already recorded"; another duplicate is a failure', async () => {
  assert.deepEqual(await recordPick(pickForm(), ME, pickStore({ error: { code: '23505', message: `duplicate key value violates unique constraint "${ONE_PICK_KEY}"` } }).deps), { ok: true, alreadyRecorded: true })
})

test('🔴 BY CONSTRAINT NAME: a racing second pick form is "someone else just chose this contact", never "already recorded"', async () => {
  const err = { code: '23505', message: `duplicate key value violates unique constraint "${ONE_CURRENT_MATCH}"` }
  assert.deepEqual(await recordPick(pickForm(), ME, pickStore({ error: err, chooser: 'Rui Antunes' }).deps), { ok: false, reason: justChosen('Rui Antunes') })
  assert.match(justChosen('Rui Antunes'), /^Rui Antunes just chose this contact/)
  assert.deepEqual(await recordPick(pickForm(), ME, pickStore({ error: err, chooser: 'throws' }).deps), { ok: false, reason: justChosen(null) })
  assert.match(justChosen(null), /^Someone else just chose/)
  assert.equal((await recordPick(pickForm(), ME, pickStore({ error: { code: '23505', message: 'duplicate key value violates unique constraint "some_other"' } }).deps)).ok, false)
})

test('🔴 THE AREAS MUST BE READ: a failed read refuses the pick, never learns from an empty list', async () => {
  const s = pickStore({ areas: null })
  assert.deepEqual(await recordPick(pickForm(), ME, s.deps), { ok: false, reason: AREAS_UNREAD })
  assert.equal(s.calls.length, 0)
})

test('🔒 THE AGENCY CHOOSES, WE RECORD; and no id or no name is refused before the store', async () => {
  for (const [over, reason] of [[{ chosenBy: 'Manuel Vale' }, SAME_PERSON], [{ chosenBy: ME }, SAME_PERSON], [{ chosenBy: '  ' }, NO_NAME], [{ pickId: null }, NO_ID]] as const) {
    const s = pickStore()
    assert.deepEqual(await recordPick(pickForm(over as Partial<PickForm>), ME, s.deps), { ok: false, reason })
    assert.equal(s.calls.length, 0)
  }
})

// ── the ways in ──────────────────────────────────────────────────────────────

test('the keys the cores recognise are the ones 0057 creates, and the actions call its functions', () => {
  const mig = readFileSync(join(import.meta.dirname, '..', '..', 'db', 'migrations', '0057_listing_acts.sql'), 'utf8')
  assert.match(mig, /create table public\.exemption_records \(\n  id uuid primary key,/)
  assert.match(mig, /unique constraint "listing_matches_pkey"/)
  assert.match(readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'publication', 'exemption-actions.ts'), 'utf8'), /rpc\('record_exemption', args\)/)
  assert.match(readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'matching', 'triage-actions.ts'), 'utf8'), /rpc\('record_agent_pick', args\)/)
})

test('🔒 nothing in the cockpit writes an exemption or an agent pick except through 0057', () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      const t = readFileSync(p, 'utf8').replace(/\s+/g, ' ')
      if (/from\( ?['"]exemption_records['"] ?\) ?\.(insert|update|upsert|delete)/.test(t)) offenders.push(`${p}: writes exemption_records`)
      if (/from\( ?['"]listing_facts['"] ?\)[^;]{0,300}\.(insert|update|upsert)\([^;]{0,300}exemption/.test(t)) offenders.push(`${p}: writes an exemption into listing_facts by hand`)
      if (/from\( ?['"]listing_matches['"] ?\) ?\.insert\([^;]{0,300}origin: ?['"]agent['"]/.test(t)) offenders.push(`${p}: inserts an agent pick by hand`)
      if (/from\( ?['"]lead_requirements['"] ?\) ?\.insert\([^;]{0,400}source: ?['"]agent['"]/.test(t)) offenders.push(`${p}: inserts an agent requirement by hand`)
    }
  }
  walk(join(import.meta.dirname, '..', 'src'))
  assert.deepEqual(offenders, [])
})
