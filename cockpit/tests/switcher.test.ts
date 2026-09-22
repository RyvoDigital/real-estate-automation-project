/*
 * THE CLIENT SWITCHER (brief §1.3), built 22 Sep 2026.
 *
 * Before today the chrome rendered a button with aria-haspopup="menu" and
 * NOTHING behind it, and the test suite was satisfied because frameSide said
 * `pressable: true`. A control's data saying it is pressable is not a menu.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { switchTargets, HOLDS_A_FORM, frameSide } from '../src/lib/frame'

const CLIENTS = [{ id: 'a', name: 'Marbella Sur' }, { id: 'b', name: 'Casa Atlântica' }, { id: 'c', name: 'Quinta do Vale' }]

test('🔒 the same screen, the other agency — and never the one you are on', () => {
  const t = switchTargets(CLIENTS, { currentClientId: 'a', currentSlug: 'report' })
  assert.deepEqual(t.map((x) => x.id), ['b', 'c'], 'the client you are on is not a destination')
  assert.deepEqual(t.map((x) => x.href), ['/c/b/report', '/c/c/report'])
  assert.deepEqual(t.map((x) => x.why), [null, null], 'nothing to explain when the screen simply exists elsewhere')
})

test('🔴 a screen holding a form lands on the other agency’s LANDING, and says why', () => {
  for (const slug of HOLDS_A_FORM) {
    const t = switchTargets(CLIENTS, { currentClientId: 'a', currentSlug: slug })
    assert.deepEqual(t.map((x) => x.href), ['/c/b', '/c/c'], `${slug} must not re-point a form at another agency`)
    assert.match(t[0].why ?? '', /form|record/, `${slug} must say why it did not stay on the screen`)
  }
})

test('🔴 a page about one of THIS agency’s records lands on the landing too', () => {
  const t = switchTargets(CLIENTS, { currentClientId: 'a', currentSlug: 'listings', deep: true })
  assert.deepEqual(t.map((x) => x.href), ['/c/b', '/c/c'])
  assert.match(t[0].why ?? '', /one record of this agency/)
})

test('a screen that does not exist for another agency opens their landing, with the reason', () => {
  for (const slug of ['thresholds', 'closes', 'declaration']) {
    const t = switchTargets(CLIENTS, { currentClientId: 'a', currentSlug: slug })
    assert.equal(t[0].href, '/c/b')
    assert.match(t[0].why ?? '', /does not exist for another agency yet/)
  }
})

test('at the operator level every agency is a destination: their landing', () => {
  const t = switchTargets(CLIENTS, {})
  assert.deepEqual(t.map((x) => x.href), ['/c/a', '/c/b', '/c/c'])
})

test('🔴 THE MENU EXISTS: a button that opens something, not a button with a label', () => {
  const island = readFileSync(new URL('../src/components/ClientSwitcher.tsx', import.meta.url), 'utf8')
  assert.match(island, /^'use client'/)
  assert.match(island, /onClick=\{\(\) => setOpen/)
  assert.match(island, /aria-expanded=\{open\}/)
  assert.match(island, /role="menu"/)
  // Every destination is a real link: it works before hydration and opens in a new tab.
  assert.match(island, /<Link className=\{styles\.item\} href=\{t\.href\}/)
  // 🔴 Never an empty box with nothing in it.
  assert.match(island, /There is no other agency yet|No agency has been taken on yet/)

  const frame = readFileSync(new URL('../src/components/Frame.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(frame, /<button[^>]*aria-haspopup/, 'the dead button must be gone, not kept beside the menu')
  assert.match(frame, /<ClientSwitcher current=\{side\.switcher\.name\}/)
  // 🔒 defaultOpen is the preview's seam, never the app's.
  assert.doesNotMatch(frame, /defaultOpen/)
})

test('🔴 PRESENTED MODE NEVER LEARNS ANOTHER AGENCY EXISTS — the read does not happen', () => {
  /*
   * §1.4 is mechanical: no other client's name may appear anywhere in the
   * served HTML, options and payloads included. Filtering after a read has
   * already put the names into the render, so presented mode does not read.
   */
  const frame = readFileSync(new URL('../src/components/Frame.tsx', import.meta.url), 'utf8')
  assert.match(frame, /mode === 'presented' \? \[\] : await switcherClients\(\)/)
  const p = frameSide('presented', { client: { id: 'a', name: 'Marbella Sur' }, current: 'notice' })
  assert.equal(p.switcher?.pressable, false, 'a dropdown listing other agencies, in front of one of them')
  // And the opener is operator-only.
  assert.match(frame, /\{mode === 'operator' && \(/)
})

test('🔒 a failed read of the client list does not take the screen down', () => {
  const read = readFileSync(new URL('../src/lib/switcher-read.ts', import.meta.url), 'utf8')
  assert.match(read, /catch \{\s*return \[\]/)
  assert.match(read, /cache\(/, 'read once per render, never cached across requests')
})
