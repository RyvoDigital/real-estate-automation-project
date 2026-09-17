/*
 * Record that an out-of-suite proof has been run. `npm run proof:bless`.
 *
 * Run the proof FIRST. This writes down that you did; it cannot check.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const REPO = resolve(new URL('../..', import.meta.url).pathname)
const BOOK = resolve(REPO, 'db/tests/proofs.json')
const book = JSON.parse(readFileSync(BOOK, 'utf8'))
const only = process.argv[2]

let who = 'unknown'
try { who = execSync('git config user.name', { encoding: 'utf8' }).trim() } catch {}

for (const p of book.proofs) {
  if (only && p.id !== only) continue
  for (const f of p.watches) {
    p.hashes[f] = createHash('sha256').update(readFileSync(resolve(REPO, f))).digest('hex')
  }
  p.last_proved = new Date().toISOString().slice(0, 10)
  p.proved_by = who
  console.log(`blessed ${p.id} (${p.watches.length} file(s)) — ${p.last_proved}, ${who}`)
}

writeFileSync(BOOK, JSON.stringify(book, null, 2) + '\n')
