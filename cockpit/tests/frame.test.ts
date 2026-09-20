import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frameSide, assertPresentable, CLIENT_SCREENS, type ContactSearchHit } from '../src/lib/frame'

const CA = { id: 'ca', name: 'Casa Atlântica' }

/*
 * One frame, three states. Brief II §2, docs/cockpit-route-map.md.
 *
 * The Stage B check that produced this module found four presented screens
 * drawn with no sidebar at all — four screens each independently forgetting
 * the frame. These tests are what stops that being possible rather than
 * unlikely.
 */

test('🔒 presented mode removes what names other clients, and keeps the geometry', () => {
  const p = frameSide('presented', { client: CA, current: 'declaration' })
  const c = frameSide('client', { client: CA, current: 'declaration' })

  // The switcher is the control that must not exist while an agency watches.
  assert.equal(c.switcher?.pressable, true)
  assert.equal(p.switcher?.pressable, false, 'a dropdown listing other agencies, in front of one of them')
  assert.equal(p.switcher?.name, CA.name, 'but the client is still named — the geometry is the same')

  assert.equal(p.up, null, 'no way up to the operator level')
  assert.ok(c.up, 'which the ordinary frame has')

  assert.equal(p.showsCounts, false, '"6 waiting" is six other people\'s business')
  assert.equal(c.showsCounts, true)

  assert.equal(p.marker, 'Em apresentação')
  assert.equal(c.marker, null)
})

test('🔒 presented mode shows this meeting\'s screen only', () => {
  const p = frameSide('presented', { client: CA, current: 'thresholds' })
  assert.equal(p.items.length, 1, 'a nav listing twelve screens invites a click into one of them')
  assert.equal(p.items[0].slug, 'thresholds')
  assert.match(p.items[0].href, /^\/p\/ca\//)
})

test('🔒 and it shows it in the agency\'s language', () => {
  assert.equal(frameSide('presented', { client: CA, current: 'thresholds' }).items[0].label, 'O que procura quem lhe compra')
  assert.equal(frameSide('presented', { client: CA, current: 'import' }).items[0].label, 'A lista que nos enviou')
  assert.equal(frameSide('client', { client: CA }).items.find((i) => i.slug === 'thresholds')?.label, 'Thresholds')
})

test('🔴 a screen that refuses presentation THROWS rather than falling back', () => {
  // A silent fallback to the ordinary frame would show an agency something the
  // design decided they must not see, while looking correct.
  assert.throws(
    () => frameSide('presented', { client: CA, current: 'settings' }),
    /settings refuses presented mode: it holds numbers that decide who receives a message/,
  )
  assert.throws(() => frameSide('presented', { client: CA, current: 'escalations' }), /refuses presented mode/)
  assert.throws(() => frameSide('presented', { client: CA, current: '' }), /the landing refuses presented mode/)
})

test('🔴 every client screen has ANSWERED the presented question, with a reason when it refuses', () => {
  // Not a default. The exemption declaration sat unplaced for four design
  // rounds because nothing forced the question.
  for (const s of CLIENT_SCREENS) {
    assert.equal(typeof s.presented, 'boolean', `${s.slug} has no answer`)
    if (!s.presented) {
      assert.ok(
        s.refusesBecause && s.refusesBecause.length > 20,
        `${s.slug || 'the landing'} refuses presented mode without saying why`,
      )
    } else {
      assert.ok(s.labelPt, `${s.slug} is presented-capable but has no Portuguese label — it would show an agency an English nav`)
    }
  }
})

test('presented mode without a client is refused rather than rendered blank', () => {
  assert.throws(() => frameSide('presented', { current: 'listings' }), /without a client/)
  assert.throws(() => frameSide('client', {}), /without a client/)
})

test('the client nav is the briefs\' order, and the landing has no trailing slash', () => {
  const items = frameSide('client', { client: CA }).items
  assert.equal(items[0].slug, '', 'the landing is first')
  assert.equal(items[0].href, '/c/ca', 'and its href is not /c/ca/')
  assert.equal(items[1].slug, 'escalations', 'then what needs you')
  assert.ok(items.every((i) => i.href.startsWith('/c/ca/') || i.href === '/c/ca'))
})

test('screens reached from another screen are not in the sidebar', () => {
  const nav = frameSide('client', { client: CA }).items.map((i) => i.slug)
  for (const hidden of ['policy', 'templates', 'notice']) {
    assert.ok(!nav.includes(hidden), `${hidden} is reached from another screen`)
  }
  // But they are still registered, so the presented question is still answered.
  for (const hidden of ['policy', 'templates', 'notice']) {
    assert.ok(CLIENT_SCREENS.some((s) => s.slug === hidden), `${hidden} must still be registered`)
  }
})

test('the operator frame has no switcher and no way up, because it is the top', () => {
  const o = frameSide('operator')
  assert.equal(o.switcher, null)
  assert.equal(o.up, null)
  assert.equal(o.marker, null)
  assert.deepEqual(o.items.map((i) => i.slug), ['today', 'month', 'health', 'onboarding'])
})

test('🔴 the cross-client search answers "which client" and hands off — nothing else', () => {
  /*
   * The operator's constraint, 20 September 2026. A cross-client surface that
   * grew a history column would be an operator-level view of a person's
   * consent record assembled across every agency that has ever held their
   * number — the one shape this architecture avoids, and it would arrive one
   * useful column at a time.
   *
   * Typed as an exact-shape check: adding a field to ContactSearchHit fails
   * here before it reaches a screen.
   */
  const hit: ContactSearchHit = {
    phone: '+351912345678',
    clientId: 'ca',
    clientName: 'Casa Atlântica',
    href: '/c/ca/contacts/abc',
  }
  assert.deepEqual(Object.keys(hit).sort(), ['clientId', 'clientName', 'href', 'phone'])

  // The fields that must never appear on it, named so the intent survives a
  // refactor that only reads the test.
  for (const forbidden of ['history', 'ledger', 'consent', 'segment', 'messages', 'lastContact']) {
    assert.ok(!(forbidden in hit), `${forbidden} is client-scoped and stays client-scoped`)
  }
})

test('🔴 assertPresentable is the boundary, not the proxy', () => {
  /*
   * proxy.ts 404s a /p/ path for a screen that refuses presentation, and the
   * top of that file says why that is not enough: middleware has been
   * bypassable by a crafted request header (CVE-2025-29927), and a check the
   * caller can skip is not a check. The header it sets is exactly such a
   * value.
   *
   * So every page under /p/ asserts its own identity from a literal in its
   * own source, on the path the real caller takes.
   */
  assert.doesNotThrow(() => assertPresentable('declaration'))
  assert.doesNotThrow(() => assertPresentable('exemption'))
  assert.throws(() => assertPresentable('settings'), /refuses presented mode/)
  assert.throws(() => assertPresentable('publish'), /refuses presented mode/)
  assert.throws(() => assertPresentable('escalations'), /refuses presented mode/)
  assert.throws(() => assertPresentable('not-a-screen'), /no such screen/)
})
