/*
 * Reconciliation, with fakes. No network, no database.
 *
 * The property the whole file defends: THIS PASS NEVER SENDS. Twilio has no
 * idempotency on message creation, so a re-dispatch after an unresolved row is
 * a coin flip on a second message. Rows it can resolve it resolves; rows it
 * cannot go to a human.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  reconcilePending, sweepOrphans, templateMatcherFromSends, GRACE_MS,
  type PendingRow, type ReconcileStore, type ProviderReader,
} from '../src/lib/send/reconcile'
import type { ProviderMessage } from '../src/lib/send/match'

const TEMPLATE = 'Olá Maria, fala a Ana da Cascais Demo.'
const NOW = new Date('2026-09-22T10:00:00.000Z')
const INTENT = '2026-09-22T09:03:11.331Z'

const row = (over: Partial<PendingRow> = {}): PendingRow => ({
  id: 'r1', clientId: 'c1', clientNumber: '+351912000001', phoneE164: '+351912345678',
  bodyIntended: TEMPLATE, intentRecordedAt: INTENT, status: 'intended', ...over,
})
const msg = (over: Partial<ProviderMessage> = {}): ProviderMessage => ({
  sid: 'SM1', to: '+351912345678', from: '+351912000001', body: TEMPLATE,
  dateSent: '2026-09-22T09:03:12.918Z', direction: 'outbound-api', ...over,
})

function fakes(rows: PendingRow[], messages: ProviderMessage[]) {
  const completed: Array<{ id: string; patch: Record<string, unknown> }> = []
  const unresolved: Array<{ id: string; patch: Record<string, unknown> }> = []
  const asked: Array<{ from: string; to?: string }> = []
  const store: ReconcileStore = {
    async pending() { return rows },
    async complete(id, patch) { completed.push({ id, patch }) },
    async markUnresolved(id, patch) { unresolved.push({ id, patch }) },
  }
  const reader: ProviderReader = {
    async listMessages(p) { asked.push({ from: p.from, to: p.to }); return messages },
  }
  return { store, reader, completed, unresolved, asked }
}

test('a found message completes the row, with the body and time from the WIRE', async () => {
  const f = fakes([row()], [msg({ sid: 'SMfound', body: TEMPLATE, dateSent: '2026-09-22T09:03:12.918Z' })])
  const out = await reconcilePending({ store: f.store, reader: f.reader, now: NOW })
  assert.equal(out.completed, 1)
  assert.equal(f.completed[0].patch.provider_message_id, 'SMfound')
  assert.equal(f.completed[0].patch.body_sent, TEMPLATE, 'the provider\'s copy, not ours')
  assert.equal(f.completed[0].patch.sent_at, '2026-09-22T09:03:12.918Z',
    'the provider\'s timestamp, because it knows when it sent')
  assert.equal(f.completed[0].patch.status, 'sent')
})

test('THE CONCIERGE REPLY does not complete the row', async () => {
  const f = fakes([row()], [msg({ sid: 'SMreply', body: 'Claro, qual é o seu horizonte temporal?' })])
  const out = await reconcilePending({ store: f.store, reader: f.reader, now: NOW })
  assert.equal(out.completed, 0)
  assert.equal(out.unresolved, 1)
  assert.match(String(f.unresolved[0].patch.last_error), /Concierge replies/)
})

test('two exact matches mark unresolved AND raise an alert — never resolve', async () => {
  const f = fakes([row()], [msg({ sid: 'SMa' }), msg({ sid: 'SMb', dateSent: '2026-09-22T09:05:00.000Z' })])
  const out = await reconcilePending({ store: f.store, reader: f.reader, now: NOW })
  assert.equal(out.completed, 0)
  assert.equal(out.alerts.length, 1)
  assert.equal(out.alerts[0].kind, 'duplicate_send')
  assert.match(out.alerts[0].detail, /never-retry rule was broken/)
})

test('a row with no body cannot be matched and says why, rather than guessing', async () => {
  const f = fakes([row({ bodyIntended: null })], [msg()])
  const out = await reconcilePending({ store: f.store, reader: f.reader, now: NOW })
  assert.equal(out.completed, 0)
  assert.match(String(f.unresolved[0].patch.last_error), /recipient and window alone/)
  assert.equal(f.asked.length, 0, 'it must not even ask: there is nothing to discriminate with')
})

test('the grace period is applied, and it is asked for rather than filtered after', async () => {
  let askedFor: Date | null = null
  const store: ReconcileStore = {
    async pending(olderThan) { askedFor = olderThan; return [] },
    async complete() {}, async markUnresolved() {},
  }
  await reconcilePending({ store, reader: { async listMessages() { return [] } }, now: NOW })
  assert.equal(askedFor!.toISOString(), new Date(NOW.getTime() - GRACE_MS).toISOString())
  assert.equal(GRACE_MS, 10 * 60 * 1000)
})

test('the search window is wider than the matcher\'s, so the matcher decides the edges', async () => {
  // The reader is asked for a generous window; matchSend applies the real one.
  // If the query were the narrower of the two, a message just outside would be
  // invisible rather than reported as "outside the window" — which is the
  // diagnosis that tells an operator the window is wrong.
  const f = fakes([row()], [])
  await reconcilePending({ store: f.store, reader: f.reader, now: NOW })
  assert.equal(f.asked.length, 1)
  assert.equal(f.asked[0].to, '+351912345678')
  assert.equal(f.asked[0].from, '+351912000001')
})

test('RECONCILIATION NEVER SENDS: the module imports nothing that can', () => {
  const src = readFileSync(new URL('../src/lib/send/reconcile.ts', import.meta.url), 'utf8')
  for (const forbidden of [/from '@\/lib\/send\/dispatch'/, /from '@\/lib\/send\/permit'/, /SendPermit/, /dispatch\(/]) {
    assert.equal(forbidden.test(src), false,
      `reconcile.ts references ${forbidden} — it must have no route to a send at all`)
  }
})

test('ORPHANS: a template with no send row halts the client', async () => {
  const reader: ProviderReader = {
    async listMessages() {
      return [msg({ sid: 'SMknown' }), msg({ sid: 'SMorphan' }), msg({ sid: 'SMchat', body: 'Combinado!' })]
    },
  }
  const out = await sweepOrphans({
    clientId: 'c1', clientNumber: '+351912000001', reader,
    knownProviderIds: new Set(['SMknown']),
    looksLikeTemplate: templateMatcherFromSends([TEMPLATE]),
    since: new Date('2026-09-20T00:00:00.000Z'),
  })
  assert.equal(out.orphans.length, 1)
  assert.equal(out.orphans[0].sid, 'SMorphan')
  assert.equal(out.halt, true)
  assert.match(out.detail, /the gate is not the only route/)
})

test('ORPHANS: a quiet night halts nothing and says how much it looked at', async () => {
  const reader: ProviderReader = {
    async listMessages() { return [msg({ sid: 'SMchat', body: 'Combinado!' })] },
  }
  const out = await sweepOrphans({
    clientId: 'c1', clientNumber: '+351912000001', reader,
    knownProviderIds: new Set(),
    looksLikeTemplate: templateMatcherFromSends([TEMPLATE]),
    since: new Date('2026-09-20T00:00:00.000Z'),
  })
  assert.equal(out.halt, false)
  assert.equal(out.orphans.length, 0)
  assert.match(out.detail, /1 outbound message\(s\) examined, all accounted for/,
    'a clean sweep must say what it examined — "no orphans" over an empty listing proves nothing (§5c)')
})

test('the interim template test catches a reused body and misses a novel one, as documented', () => {
  const looks = templateMatcherFromSends([TEMPLATE])
  assert.equal(looks(TEMPLATE), true)
  assert.equal(looks('Uma campanha totalmente nova que nunca enviámos'), false,
    'a novel template sent outside the gate is NOT caught until the templates table exists — ' +
    'asserted so the gap is a decision rather than a surprise')
})
