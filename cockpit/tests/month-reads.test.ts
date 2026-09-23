import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pageFile } from './lib/routes'
import { CONTRACT_COLUMNS, MONTH_SOURCES } from '../src/lib/month/read'

/*
 * Brief I §2.11, "Reads — named columns, from the view, and never three dead
 * ones". These hold the READ, not the model: a page that sums the table counts
 * every correction twice, and a page using `*` or a dead column breaks on the
 * drop that is owed.
 */

test('contracts are read from the view, never the table', () => {
  assert.equal(MONTH_SOURCES.contracts.from, 'client_contracts_uncorrected')
})

test('the contract columns are exactly the brief\'s fourteen, in its order', () => {
  assert.deepEqual([...CONTRACT_COLUMNS], [
    'id', 'automation_client_id', 'web_client_id', 'monthly_eur', 'setup_eur', 'setup_terms',
    'starts_on', 'ends_on', 'automations', 'signed_by', 'recorded_by', 'recorded_at', 'created_at', 'supersedes_id',
  ])
})

test('no Month source names a dead column, received_on, or *', () => {
  const dead = ['superseded_at', 'superseded_by', 'updated_at', 'received_on', '*']
  for (const [k, s] of Object.entries(MONTH_SOURCES)) {
    for (const d of dead) assert.ok(!(s.columns as readonly string[]).includes(d), `${k} names ${d}`)
  }
})

// The source, not just the constants: nothing under month/ or the page may
// read the table or a dead column by some other route.
const ROOT = new URL('../src/', import.meta.url).pathname
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const f = join(dir, e)
    return statSync(f).isDirectory() ? files(f) : /\.(ts|tsx)$/.test(e) ? [f] : []
  })
}
const MONTH_FILES = [
  ...files(join(ROOT, 'lib/month')),
  ...files(join(ROOT, 'components/month')),
  // 🔒 By ROUTE, not by shelf: The Month is `/`, and on 23 Sep 2026 it moved
  // into the (operator) route group without its URL changing. A literal path
  // here made this check fail on a move that changed nothing it tests.
  pageFile('/'),
]

test('no Month file selects *, reads the contracts table, or names a dead column', () => {
  assert.ok(MONTH_FILES.length >= 3, 'a check that reads nothing proves nothing')
  for (const f of MONTH_FILES) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.ok(!/select\(\s*['"`]\*/.test(src), `${f}: select('*')`)
    assert.ok(!/from\(\s*['"`]client_contracts['"`]/.test(src), `${f}: reads the client_contracts TABLE`)
    for (const d of ['superseded_at', 'superseded_by', 'received_on']) assert.ok(!src.includes(d), `${f}: names ${d}`)
    assert.ok(!/['"`.]updated_at\b/.test(src), `${f}: names updated_at`)
  }
})
