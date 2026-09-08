/*
 * Does the matching query actually EXCLUDE a listing that is no longer for sale?
 *
 * §3: "A listing that goes under offer must stop matching. Nothing is worse
 * than telling a buyer about a house that sold last week." That is the worst
 * output this automation can produce, and it is the one thing in F2 that fails
 * silently — a sold listing that goes on matching produces no error anywhere.
 *
 * Lessons §7: a filter is not tested by the rows it returns, it is tested by
 * the rows it REFUSES. So this inserts one listing of EVERY status, asserts
 * exactly which come back, and fails if nothing was excluded — a query that
 * returned everything would otherwise pass an "it found the available one"
 * check identically.
 *
 * It applies applyMatchable(), the same function store.ts ships, so the probe
 * cannot drift from the query it is proving (lesson 15).
 *
 * WRITES TO THE DATABASE: five listings for the ZZ TEST client, removed in a
 * finally block. Run only with the operator's go-ahead.
 *
 *   node node_modules/tsx/dist/cli.mjs tests/probe-listing-excludes.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { applyMatchable } from '../src/lib/listings/query'
import { STATUSES, isMatchable } from '../src/lib/listings/status'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const { data: client } = await db.from('clients').select('id, name').like('name', 'ZZ TEST%').single()
  if (!client) throw new Error('no ZZ TEST client — refusing to write listings against a real one')
  console.log(`\nListing matchability — one of every status, against ${client.name}\n`)

  const ids: string[] = []
  try {
    for (const status of STATUSES) {
      const { data, error } = await db.from('listings').insert({
        client_id: client.id,
        reference: `EXCLUDE-PROBE-${status}`,
        area: 'Cascais',
        bedrooms: 3,
        price: 900_000,
        status,
        source: 'probe',
      }).select('id').single()
      if (error) throw new Error(`insert ${status} failed: ${error.message}`)
      ids.push(data!.id as string)
    }
    check(ids.length === STATUSES.length, 'one listing of every status exists', `${ids.length}`)

    // THE SHIPPING FILTER, not a copy of it.
    const base = db.from('listings').select('id, reference, status').eq('client_id', client.id)
    const { data: got, error } = await applyMatchable(base)
    if (error) throw new Error(`matchable query failed: ${error.message}`)

    const returned = new Set((got ?? []).map((r) => r.id as string))
    const mine = (got ?? []).filter((r) => String(r.reference).startsWith('EXCLUDE-PROBE-'))

    for (const [i, status] of STATUSES.entries()) {
      const inResult = returned.has(ids[i])
      check(
        inResult === isMatchable(status),
        `${status.padEnd(11)} is ${isMatchable(status) ? 'returned' : 'EXCLUDED'}`,
        inResult ? 'returned' : 'excluded',
      )
    }

    // The negative assertion. Without it, a filter that did nothing at all
    // would pass every check above that expects a row to be present.
    const excluded = STATUSES.length - mine.length
    check(
      excluded >= 4,
      'the filter actually excluded something',
      `${excluded} of ${STATUSES.length} refused — a filter that did nothing would exclude 0`,
    )

    // And the specific one the gate is about.
    const sold = ids[STATUSES.indexOf('sold')]
    const underOffer = ids[STATUSES.indexOf('under_offer')]
    check(!returned.has(sold), 'a SOLD listing is never matchable')
    check(!returned.has(underOffer), 'an UNDER OFFER listing is never matchable')
  } finally {
    // Read the evidence before cleaning up (rule 11) — the checks above have
    // all run by now.
    if (ids.length) {
      const { error } = await db.from('listings').delete().in('id', ids)
      console.log(`\n   cleanup: ${error ? 'FAILED ' + error.message : `${ids.length} probe listings removed`}`)
      const { count } = await db.from('listings').select('id', { count: 'exact', head: true })
      console.log(`   listings remaining: ${count}`)
    }
  }

  console.log(`\n  ${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
