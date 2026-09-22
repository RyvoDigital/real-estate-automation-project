import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { good } from './fixtures/onboarding-draft'
import { createClientCore, probeVerdict, type CreateDeps, type CalendarProbe } from '../src/lib/onboarding-create'
import type { ClientDraft } from '../src/lib/onboarding'

/*
 * Every write path of creating a client (/onboarding rebuild, checkpoint 1,
 * 22 Sep 2026). It writes clients.rehearsal, which every business figure
 * trusts, and it can leave a half-made client holding a WhatsApp number that
 * 0007 makes unique, so each path is driven here with a fake database that
 * records what was written, and each asserts what remains afterwards.
 */

type Row = Record<string, unknown>

function fakeDb(over: Partial<{
  probe: CalendarProbe
  clash: { id: string; name: string } | null
  /** what create_client_with_config raises, if anything (0053) */
  raises: { code?: string; message: string } | null
  readBack: boolean
  eventError: { message: string } | null
}> = {}) {
  const o = {
    probe: { ok: true, error: null, busyCount: 3 } as CalendarProbe,
    clash: null, raises: null, readBack: true, eventError: null, ...over,
  }
  const state = {
    clients: new Map<string, Row>(), configs: [] as Row[], events: [] as Row[],
    probes: 0, calls: [] as { client: Row; key: string; config: Row }[], revalidated: [] as string[],
  }
  const deps: CreateDeps = {
    async probeCalendar() { state.probes++; return o.probe },
    async findClientByNumber() { return o.clash },
    // The fake keeps 0053's promise: the client and its config, or NEITHER.
    async createAtomically(client, key, config) {
      state.calls.push({ client, key, config })
      if (o.raises) return { id: null, error: o.raises }
      const id = `client-${state.clients.size + 1}`
      state.clients.set(id, client)
      state.configs.push({ client_id: id, automation_key: key, enabled: true, config })
      return { id, error: null }
    },
    async readConfig(clientId) {
      const c = state.configs.find((r) => r.client_id === clientId)
      return o.readBack && c ? { config: c.config } : null
    },
    async insertEvent(row) { if (o.eventError) return { error: o.eventError }; state.events.push(row); return { error: null } },
    revalidate(path) { state.revalidated.push(path) },
  }
  return { deps, state }
}

const draft = (d: Partial<ClientDraft> = {}): ClientDraft => ({ ...good, ...d })

// ---------------------------------------------------------------- success

test('a rehearsal: one client with rehearsal=true, one enabled config, one event, pages revalidated', async () => {
  const { deps, state } = fakeDb()
  const r = await createClientCore(draft({ rehearsal: 'rehearsal' }), deps)
  assert.equal(r.ok, true)
  assert.equal(state.clients.size, 1)
  const [row] = [...state.clients.values()]
  assert.equal(row.rehearsal, true)
  assert.equal(row.whatsapp_number, '+34600123456')
  assert.equal(row.status, 'active')
  assert.equal(state.configs.length, 1)
  assert.equal(state.configs[0].enabled, true)
  assert.equal(state.calls.length, 1, 'one call: the client and its config are one transaction')
  assert.equal(state.calls[0].key, 'inbound_concierge')
  assert.equal(state.events.length, 1)
  assert.equal(state.events[0].type, 'client.created')
  assert.equal((state.events[0].data as Row).rehearsal, true)
  assert.deepEqual(state.revalidated.sort(), ['/leads', '/onboarding'])
  assert.match(r.message, /as a rehearsal/)
})

test('a real agency: rehearsal=false, and the message says which', async () => {
  const { deps, state } = fakeDb()
  const r = await createClientCore(draft({ rehearsal: 'real' }), deps)
  assert.equal(r.ok, true)
  assert.equal([...state.clients.values()][0].rehearsal, false)
  assert.match(r.message, /as a real agency/)
})

test('the WhatsApp number is stored normalised (spaces, brackets and dashes removed)', async () => {
  const { deps, state } = fakeDb()
  await createClientCore(draft({ whatsappNumber: '+34 (600) 123-456' }), deps)
  assert.equal([...state.clients.values()][0].whatsapp_number, '+34600123456')
})

// ---------------------------------------------------------------- the rehearsal answer

test('🔴 unanswered rehearsal: nothing written, no probe, no default', async () => {
  for (const rehearsal of ['', undefined, 'yes', 'REAL '.toLowerCase().slice(0, 3)]) {
    const { deps, state } = fakeDb()
    const r = await createClientCore(draft({ rehearsal: rehearsal as ClientDraft['rehearsal'] }), deps)
    assert.equal(r.ok, false, `rehearsal=${JSON.stringify(rehearsal)}`)
    assert.equal(state.clients.size, 0)
    assert.equal(state.probes, 0, 'an unanswered question must not reach the network')
    if (!r.ok) assert.ok(r.errors.some((e) => e.field === 'rehearsal'))
  }
})

// ---------------------------------------------------------------- the calendar (S4)

test('probeVerdict: an answer about THIS calendar is "wrong"; everything else "could not run"', () => {
  const v = (error: string | null, ok = false) => probeVerdict({ ok, error, busyCount: null })
  assert.equal(v(null, true), 'confirmed')
  assert.equal(v('calendar_error:notFound'), 'calendar_wrong')
  assert.equal(v('calendar_absent_from_response'), 'calendar_wrong')
  assert.equal(v('google_http_404:Not Found'), 'calendar_wrong')
  for (const e of ['validation_not_configured', 'unauthorised', 'unreachable:fetch failed', 'google_http_500', 'google_http_401:Invalid Credentials', 'google_http_403', 'something new', null]) {
    assert.equal(v(e), 'could_not_run', String(e))
  }
})

test('S4: the check could not run -> nothing written, and the calendar field is NOT blamed', async () => {
  const { deps, state } = fakeDb({ probe: { ok: false, error: 'unreachable:fetch failed', busyCount: null } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.kind, 'probe_could_not_run')
    assert.deepEqual(r.errors, [], 'no field error: this is not the operator\'s mistake')
    assert.match(r.message, /could not run/)
  }
  assert.equal(state.clients.size, 0)
})

test('the calendar is wrong -> a calendarId field error, nothing written', async () => {
  const { deps, state } = fakeDb({ probe: { ok: false, error: 'calendar_error:notFound', busyCount: null } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.kind, 'calendar_wrong')
    assert.ok(r.errors.some((e) => e.field === 'calendarId'))
  }
  assert.equal(state.clients.size, 0)
})

// ---------------------------------------------------------------- the number (0007)

test('a number another client holds -> refused by the check, naming that client, nothing written', async () => {
  const { deps, state } = fakeDb({ clash: { id: 'c9', name: 'Cascais Homes' } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.kind, 'duplicate'); assert.match(r.errors[0].message, /Cascais Homes already uses this number/) }
  assert.equal(state.clients.size, 0)
})

test('a duplicate that races past the check -> 0007\'s unique violation is the same refusal, not a generic failure', async () => {
  const { deps, state } = fakeDb({ raises: { code: '23505', message: 'duplicate key value violates unique constraint' } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.kind, 'duplicate'); assert.ok(r.errors.some((e) => e.field === 'whatsappNumber')) }
  assert.equal(state.clients.size, 0)
})

test('any other failure of the transaction -> nothing written, the reason given', async () => {
  const { deps, state } = fakeDb({ raises: { code: '42501', message: 'permission denied for table clients' } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.kind, 'write_failed'); assert.match(r.message, /permission denied/) }
  assert.equal(state.clients.size, 0)
})

// ---------------------------------------------------------------- 🔴 nothing kept half-made (0053)

test('🔴 the config refused inside the transaction: nothing kept, the number free, no delete attempted', async () => {
  const { deps, state } = fakeDb({ raises: { code: '23514', message: 'new row violates check constraint' } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.kind, 'write_failed')
    assert.match(r.message, /Nothing was saved: the client and its config are one transaction/)
    assert.equal(r.leftBehind, null)
  }
  assert.equal(state.clients.size, 0)
  assert.equal(state.configs.length, 0)
  assert.equal(state.events.length, 0, 'no client.created event for a client that does not exist')
  assert.deepEqual(state.revalidated, [])
})

test('the automation missing from the catalogue (P0002): nothing created, and it says what to fix', async () => {
  const { deps, state } = fakeDb({ raises: { code: 'P0002', message: 'the automation is not in the catalogue' } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) { assert.equal(r.kind, 'write_failed'); assert.match(r.message, /missing from the catalogue, so nothing was created/) }
  assert.equal(state.clients.size, 0)
})

test('🔴 the config not reading back: NOTHING is deleted; the client is named so it can be checked', async () => {
  const { deps, state } = fakeDb({ readBack: false })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.leftBehind, 'client-1')
    assert.match(r.message, /Nothing was deleted/)
  }
  assert.equal(state.clients.size, 1, 'the transaction committed both rows; nothing may remove them')
  assert.equal(state.events.length, 0)
})

test('🔒 there is NO delete path: neither the core nor the server action can delete a client (0049; operator, 22 Sep)', () => {
  const core = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'onboarding-create.ts'), 'utf8')
  const actions = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'actions.ts'), 'utf8')
  const wrapper = actions.slice(actions.indexOf('export async function createClient('), actions.indexOf('\n}\n', actions.indexOf('export async function createClient(')))
  assert.doesNotMatch(core, /\.delete\(|deleteClient/)
  assert.doesNotMatch(wrapper, /\.delete\(|deleteClient/)
  assert.match(wrapper, /db\.rpc\('create_client_with_config'/)
  // and the old two-insert path is gone from the wrapper
  assert.doesNotMatch(wrapper, /from\('clients'\)\.insert|from\('client_automations'\)\.insert/)
})

// ---------------------------------------------------------------- the audit event

test('the client.created event failing does not undo a complete client, and is said', async () => {
  const { deps, state } = fakeDb({ eventError: { message: 'events insert refused' } })
  const r = await createClientCore(draft(), deps)
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.eventFailed, true); assert.match(r.message, /audit event did not write/) }
  assert.equal(state.clients.size, 1)
  assert.equal(state.configs.length, 1)
})

// ---------------------------------------------------------------- validation first

test('an invalid draft writes nothing and never probes', async () => {
  const { deps, state } = fakeDb()
  const r = await createClientCore(draft({ timezone: 'GMT+1' }), deps)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.kind, 'invalid')
  assert.equal(state.probes, 0)
  assert.equal(state.clients.size, 0)
})
