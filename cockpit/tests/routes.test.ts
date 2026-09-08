import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appRoutes, splitRoutes } from './lib/routes'

test('every page under src/app is discovered', () => {
  const r = appRoutes({ byRoute: { '/leads/[id]': 'X', '/import/[id]': 'Y' } })
  for (const expected of ['/', '/queue', '/leads', '/leads/X', '/onboarding', '/health', '/report', '/login', '/import', '/import/Y']) {
    assert.ok(r.includes(expected), `${expected} must be discovered — a probe that misses it stops covering it`)
  }
})

test('a dynamic route with no parameter is reported, never dropped', () => {
  const { usable, skipped } = splitRoutes()
  assert.ok(skipped.includes('/leads/[id]'), 'the caller must be told what was skipped')
  assert.ok(skipped.includes('/import/[id]'))
  assert.ok(!usable.some((r) => r.includes('[')), 'no unfilled route is handed out as usable')
})

test('exclusions are explicit', () => {
  const r = appRoutes({ byRoute: { '/leads/[id]': 'X' }, exclude: ['/login'] })
  assert.ok(!r.includes('/login'))
  assert.ok(r.includes('/queue'))
})
