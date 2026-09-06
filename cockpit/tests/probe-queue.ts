/*
 * Does `.not('qualification->>escalated', 'is', null)` return what we think?
 *
 * This is the one claim in E1 that cannot be settled by a build. n8n calls
 * PostgREST and so does the cockpit, so the filter has to be exercised
 * through PostgREST — migration 0003 is in the lessons file precisely
 * because a careful test that used raw SQL proved nothing about the path
 * the real caller takes.
 *
 * The method is a differential: run the filter, and separately pull every
 * lead and decide in JavaScript which ones are escalated. If the two
 * disagree, the filter is wrong. Anything the filter finds that the
 * ground truth does not is a false positive; the reverse is a dropped lead,
 * which is the failure that matters.
 *
 * It refuses to report success against an empty set. Comparing nothing to
 * nothing reports a perfect match — instance 4.
 *
 *   npx tsx tests/probe-queue.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { classify, minutesSince, parseEscalated, tierFor } from '../src/lib/escalation'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

let failures = 0
const fail = (msg: string) => {
  console.log(`   FAIL — ${msg}`)
  failures++
}

async function main() {
  console.log('== 0. is there anything here at all? ==')

  const { count: totalLeads, error: countErr } = await db
    .from('leads')
    .select('*', { count: 'exact', head: true })
  if (countErr) throw new Error(`count failed: ${countErr.message}`)
  console.log(`   leads in the table: ${totalLeads}`)

  if (!totalLeads) {
    console.log('\n   STOP. Zero leads. Every comparison below would pass vacuously.')
    console.log('   An empty set is not evidence the filter works.')
    process.exit(2)
  }

  // ---------------------------------------------------------------- truth
  console.log('\n== 1. ground truth, computed here rather than by the filter ==')
  const { data: all, error: allErr } = await db
    .from('leads')
    .select('id, qualification')
    .limit(5000)
  if (allErr) throw new Error(`full scan failed: ${allErr.message}`)

  const truth = new Set<string>()
  let explicitNull = 0
  let keyMissing = 0
  let emptyObject = 0
  for (const row of all ?? []) {
    const q = row.qualification as Record<string, unknown> | null
    if (!q || Object.keys(q).length === 0) emptyObject++
    else if (!('escalated' in q)) keyMissing++
    else if (q.escalated === null) explicitNull++

    if (parseEscalated(q)) truth.add(row.id as string)
  }

  console.log(`   scanned:                       ${all?.length}`)
  console.log(`   escalated per parseEscalated:  ${truth.size}`)
  console.log(`   qualification empty/null:      ${emptyObject}`)
  console.log(`   key absent:                    ${keyMissing}`)
  console.log(`   escalated explicitly null:     ${explicitNull}`)

  // ------------------------------------------------------------- the filter
  console.log('\n== 2. the filter the cockpit actually ships ==')
  const { data: filtered, error: fErr } = await db
    .from('leads')
    .select('id, qualification')
    .not('qualification->>escalated', 'is', null)
    .limit(5000)
  if (fErr) throw new Error(`filtered query failed: ${fErr.message}`)

  const got = new Set((filtered ?? []).map((r) => r.id as string))
  console.log(`   rows returned:                 ${got.size}`)

  const missed = [...truth].filter((id) => !got.has(id))
  const extra = [...got].filter((id) => !truth.has(id))

  console.log('\n== 3. differential ==')
  console.log(`   dropped by the filter (leads that would vanish): ${missed.length}`)
  console.log(`   returned but not escalated (false positives):    ${extra.length}`)

  if (truth.size === 0) {
    console.log('\n   INCONCLUSIVE. No lead in the table is escalated, so the filter')
    console.log('   returning nothing proves nothing. Seed one and run again.')
    process.exit(3)
  }

  if (missed.length) fail(`${missed.length} escalated lead(s) never reach the queue: ${missed.slice(0, 5).join(', ')}`)
  if (extra.length) fail(`${extra.length} non-escalated lead(s) appear in the queue: ${extra.slice(0, 5).join(', ')}`)
  if (!missed.length && !extra.length) {
    console.log(`   PASS — the filter and the ground truth agree on all ${truth.size}.`)
  }

  // ------------------------------------------------ what the queue will show
  console.log('\n== 4. what the queue will actually render ==')
  const { data: rows } = await db
    .from('leads')
    .select('id, full_name, client_id, qualification')
    .not('qualification->>escalated', 'is', null)
    .limit(200)

  const shaped = (rows ?? []).map((r) => {
    const esc = parseEscalated(r.qualification)!
    const mins = minutesSince(esc.at)
    return {
      name: (r.full_name as string) ?? '(no name)',
      at: esc.at,
      mins,
      tier: tierFor(mins),
      reasons: esc.reasons,
      cls: classify(esc.reasons),
    }
  })
  shaped.sort((a, b) => b.mins - a.mins)

  for (const s of shaped) {
    console.log(
      `   ${String(s.mins).padStart(6)}m  t${s.tier}  ${s.cls.classes.join('+').padEnd(20)} ` +
        `${s.name.slice(0, 22).padEnd(23)} ${s.reasons.join(' | ')}`,
    )
  }
  if (shaped.length === 0) console.log('   (none)')

  const multi = shaped.filter((s) => s.reasons.length > 1)
  console.log(`\n   leads carrying more than one reason: ${multi.length}`)
  if (multi.length === 0) {
    console.log('   NOTE: the reasons[] rule is therefore not exercised by live data.')
    console.log('   The unit tests cover it; production has not produced the case yet.')
  }

  // ---------------------------------------------------------- related tables
  console.log('\n== 5. the tables the lead page reads ==')
  for (const t of ['clients', 'messages', 'events']) {
    const { count, error } = await db.from(t).select('*', { count: 'exact', head: true })
    console.log(`   ${t.padEnd(9)} ${error ? `ERROR ${error.message}` : `${count} rows`}`)
    if (error) failures++
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('PROBE THREW:', e.message)
  process.exit(2)
})
