/*
 * The differential in probe-queue.ts passed against one lead, which was
 * escalated. Every row matched, so a filter that did nothing at all would
 * have passed identically. That is the empty-set pass wearing a new hat:
 * the filter has never been shown to EXCLUDE anything.
 *
 * This inserts three clearly-marked probe leads, checks which ones the
 * queue's filter returns, and deletes them again in a finally block. The
 * third case is the one worth the trouble:
 *
 *   A. qualification {}                      -> key absent  -> must be OUT
 *   B. qualification {"escalated": null}     -> JSON null   -> ???
 *   C. qualification {"escalated": {...}}    -> real        -> must be IN
 *
 * B is a genuine Postgres trap. `'{"escalated": null}'::jsonb -> 'escalated'`
 * is jsonb `null`, which is NOT SQL NULL, so `IS NULL` is FALSE and the row
 * survives `.not(... 'is', null)`. If that is what happens, then any code
 * that "clears" an escalation by writing null — which is the obvious way to
 * write §5.3's hand-back-to-the-AI at E2 — leaves the lead in the queue for
 * ever, and the screen gives no hint.
 *
 * C also carries TWO reasons, which live data has never produced, so this
 * is the first time the reasons[] rule is exercised against the database
 * rather than against a fixture.
 *
 *   node node_modules/tsx/dist/cli.mjs tests/probe-filter-excludes.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseEscalated } from '../src/lib/escalation'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const MARK = 'ZZ-PROBE-DELETE-ME'
const ids: string[] = []
let failures = 0

async function main() {
  const { data: client } = await db.from('clients').select('id, name').limit(1).single()
  if (!client) throw new Error('no client row to attach probe leads to')
  console.log(`   attaching probe rows to client: ${client.name}\n`)

  const cases = [
    { key: 'A key absent', phone: '+990000000001', qualification: {}, expectIn: false },
    {
      key: 'B escalated null',
      phone: '+990000000002',
      qualification: { escalated: null },
      expectIn: false,
    },
    {
      key: 'C two reasons',
      phone: '+990000000003',
      qualification: {
        escalated: {
          at: new Date(Date.now() - 300 * 60000).toISOString(),
          reason: 'high_value:3200000>=1500000',
          reasons: ['high_value:3200000>=1500000', 'booking_failed:conflict_burned_id'],
        },
      },
      expectIn: true,
    },
  ]

  for (const c of cases) {
    const { data, error } = await db
      .from('leads')
      .insert({
        client_id: client.id,
        full_name: `${MARK} ${c.key}`,
        phone: c.phone,
        source: 'whatsapp',
        qualification: c.qualification,
      })
      .select('id')
      .single()
    if (error) throw new Error(`insert ${c.key} failed: ${error.message}`)
    ids.push(data.id as string)
  }
  console.log(`   inserted ${ids.length} probe leads\n`)

  // Two candidate filters. `->` yields jsonb, so a JSON null is not SQL
  // NULL and survives. `->>` yields text, and the text of a jsonb null IS
  // SQL NULL — which is the behaviour we want. Measured, not assumed.
  const variants = [
    { name: '-> (shipped)', col: 'qualification->escalated' },
    { name: '->> (candidate)', col: 'qualification->>escalated' },
  ]

  const results = new Map<string, Set<string>>()
  let candidateRows: { id: string; qualification: unknown }[] = []
  for (const v of variants) {
    const { data, error } = await db
      .from('leads')
      .select('id, qualification')
      .not(v.col, 'is', null)
      .limit(500)
    if (error) throw new Error(`${v.name} query failed: ${error.message}`)
    results.set(v.name, new Set((data ?? []).map((r) => r.id as string)))
    if (v.name.startsWith('->>')) {
      candidateRows = (data ?? []) as { id: string; qualification: unknown }[]
    }
  }

  const got = results.get('->> (candidate)')!

  console.log('   case                     expected   ->        ->>       parser')
  console.log('   ----------------------------------------------------------------')
  cases.forEach((c, i) => {
    const id = ids[i]
    const a = results.get('-> (shipped)')!.has(id)
    const b = results.get('->> (candidate)')!.has(id)
    const inParser = parseEscalated(c.qualification) !== null
    const ok = b === c.expectIn && inParser === c.expectIn
    if (!ok) failures++
    console.log(
      `   ${c.key.padEnd(24)} ${(c.expectIn ? 'IN' : 'OUT').padEnd(10)} ` +
        `${(a ? 'IN' : 'OUT').padEnd(9)} ${(b ? 'IN' : 'OUT').padEnd(9)} ` +
        `${inParser ? 'IN' : 'OUT'}${ok ? '' : '   <-- MISMATCH'}`,
    )
  })

  // Proof the filter can exclude at all: at least one row must be absent.
  const excluded = cases.filter((_, i) => !got.has(ids[i])).length
  console.log(`\n   rows the filter excluded: ${excluded} of ${cases.length}`)
  if (excluded === 0) {
    console.log('   FAIL — the filter excluded nothing. It may be a no-op.')
    failures++
  }

  // And the reasons[] rule, against the database rather than a fixture.
  const c = candidateRows.find((r) => r.id === ids[2])
  const esc = c ? parseEscalated(c.qualification) : null
  console.log(`\n   case C reasons read back from Postgres: ${esc?.reasons.length ?? 0}`)
  if ((esc?.reasons.length ?? 0) !== 2) {
    console.log('   FAIL — a lead with two reasons did not round-trip.')
    failures++
  } else {
    console.log(`   ${esc!.reasons.join('  +  ')}`)
  }
}

main()
  .catch((e) => {
    console.error('PROBE THREW:', e.message)
    failures++
  })
  .finally(async () => {
    if (ids.length) {
      const { error } = await db.from('leads').delete().in('id', ids)
      const { count } = await db
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .like('full_name', `${MARK}%`)
      console.log(
        `\n   cleanup: ${error ? `FAILED ${error.message}` : `deleted ${ids.length}`}, ` +
          `probe rows still present: ${count}`,
      )
      if (count !== 0) failures++
    }
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
    process.exit(failures === 0 ? 0 : 1)
  })
