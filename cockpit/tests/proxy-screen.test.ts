import { test } from 'node:test'
import assert from 'node:assert/strict'
import { screenFor } from '../src/proxy'
import { CLIENT_SCREENS } from '../src/lib/frame'

/*
 * The middleware resolves which screen a /c/ or /p/ path is, so the frame can
 * be told without the browser being asked. docs/cockpit-route-map.md §4.
 */

test('a client path resolves to its client and its screen', () => {
  assert.deepEqual(screenFor('/c/ca/escalations'), { frame: 'c', client: 'ca', slug: 'escalations' })
  assert.deepEqual(screenFor('/p/ca/declaration'), { frame: 'p', client: 'ca', slug: 'declaration' })
})

test('the client landing has an empty slug rather than no match', () => {
  assert.deepEqual(screenFor('/c/ca'), { frame: 'c', client: 'ca', slug: '' })
  assert.deepEqual(screenFor('/c/ca/'), { frame: 'c', client: 'ca', slug: '' })
})

test('🔒 a screen three segments deep still resolves to a REGISTERED screen', () => {
  // Otherwise a deep route would inherit the presented answer of whatever it
  // sits under: /p/ca/listings/<id>/triage is not "listings".
  assert.equal(screenFor('/c/ca/listings/abc/triage')?.slug, 'triage')
  assert.equal(screenFor('/c/ca/listings/abc/exemption')?.slug, 'exemption')
  assert.equal(screenFor('/c/ca/listings/abc')?.slug, 'listings')
  assert.equal(screenFor('/c/ca/import/batch-14')?.slug, 'import')
})

test('nothing outside the two frames matches', () => {
  for (const p of ['/', '/today', '/health', '/login', '/api/health', '/queue', '/leads/abc']) {
    assert.equal(screenFor(p), null, `${p} must not be treated as a client frame`)
  }
})

test('🔴 every deep segment the router can produce resolves to a registered screen or to the landing', () => {
  // A slug that resolves to '' is the landing, whose presented answer is
  // "refuses". So an unregistered deep path can never accidentally be
  // presentable — it falls back to the strictest answer, not the loosest.
  const unknown = screenFor('/p/ca/something-nobody-registered')
  assert.equal(unknown?.slug, '')
  const landing = CLIENT_SCREENS.find((s) => s.slug === '')
  assert.equal(landing?.presented, false, 'and the landing refuses, so the fallback is a refusal')
})

test('the control: the matcher distinguishes the two frames', () => {
  assert.equal(screenFor('/c/ca/listings')?.frame, 'c')
  assert.equal(screenFor('/p/ca/listings')?.frame, 'p')
})

test('🔴 a sub-screen never inherits its parent\'s presented answer', () => {
  /*
   * Found by the test above on 20 September 2026. With `publish` unregistered,
   * /p/<client>/listings/<id>/publish resolved to the slug `listings`, which is
   * presented-capable — so the gate in depth, an English operator screen that
   * refuses presentation, would have been served to an agency while looking
   * entirely correct.
   *
   * This is the same defect as a screen DEFAULTING to an answer, arriving by
   * inheritance instead of by omission.
   */
  const deep = screenFor('/p/ca/listings/abc/publish')
  assert.equal(deep?.slug, 'publish', 'not listings')
  const publish = CLIENT_SCREENS.find((s) => s.slug === 'publish')
  assert.equal(publish?.presented, false)

  // Every sub-screen the route map names is registered, with its own answer.
  for (const slug of ['triage', 'exemption', 'piece', 'publish']) {
    assert.ok(CLIENT_SCREENS.some((s) => s.slug === slug), `${slug} is a route and must answer the presented question`)
  }
})
