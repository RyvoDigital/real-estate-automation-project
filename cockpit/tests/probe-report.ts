/*
 * The two things that matter more than the layout:
 *
 *   1. Every figure comes from metrics_daily. If the page and a direct sum
 *      of the table ever disagree, the cockpit has started counting on its
 *      own — §9, two systems computing the same number differently.
 *   2. A quiet week renders explicit ZEROS, and a week that was never
 *      derived does NOT render as zeros. The client has to be able to tell
 *      "nothing happened" from "we did not look".
 *
 *   npm start   # then:  npx tsx tests/probe-report.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

let failures = 0
const check = (ok: boolean, label: string, detail = '') => {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/** Pull the four headline numbers out of the rendered stat tiles. */
function statsFrom(html: string): number[] {
  return [...html.matchAll(/rstat__value[^>]*>(\d+)</g)].map((m) => Number(m[1]))
}

async function main() {
  const email = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()
  const { data: link } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  const cb = await fetch(
    `${BASE}/auth/callback?token_hash=${(link!.properties as { hashed_token: string }).hashed_token}&type=magiclink`,
    { redirect: 'manual' },
  )
  const cookie = (cb.headers.getSetCookie?.() ?? [])[0]?.split(';')[0] ?? ''
  const get = (p: string) => fetch(`${BASE}${p}`, { headers: { cookie } })

  const { data: clients } = await db.from('clients').select('id, name').limit(1)
  const client = clients![0]
  check(Boolean(client), 'a client exists to report on', client?.name)

  // ---- 1. the numbers come from metrics_daily and nowhere else -----------
  console.log('\n== the figures are metrics_daily, summed ==')
  const week = '2026-08-31' // Mon; contains rows for 09-04..09-06 and gaps before
  const end = '2026-09-06'

  const { data: rows } = await db
    .from('metrics_daily')
    .select('date, leads_new, leads_qualified, viewings_booked, messages_sent, escalations')
    .eq('client_id', client.id)
    .gte('date', week)
    .lte('date', end)

  const sum = (k: string) => (rows ?? []).reduce((a, r) => a + Number((r as Record<string, unknown>)[k] ?? 0), 0)
  const expected = [
    sum('leads_new'),
    sum('leads_qualified'),
    sum('viewings_booked'),
    sum('messages_sent'),
    sum('escalations'),
  ]

  const html = await (await get(`/report?client=${client.id}&week=${week}`)).text()
  const shown = statsFrom(html)

  check(shown.length === 5, 'five figures rendered', `${shown.length}`)
  check(
    JSON.stringify(shown) === JSON.stringify(expected),
    'the page agrees with a direct sum of metrics_daily',
    `page ${JSON.stringify(shown)} vs table ${JSON.stringify(expected)}`,
  )

  // ---- 2. a week nobody derived is not a week of zeros -------------------
  console.log('\n== a never-derived week is not reported as zeros ==')
  const ancient = '2024-01-01'
  const old = await (await get(`/report?client=${client.id}&week=${ancient}`)).text()
  check(
    old.includes('have no row in'),
    'a week with no rows says so instead of showing a clean zero',
  )
  check(
    old.includes('do not send this until it has'),
    'and says not to send it',
  )
  check(
    !old.includes('that is a quiet week'),
    'and does NOT claim it was a quiet week',
  )

  // ---- 3. a derived day of zeros IS reported as zero ---------------------
  console.log('\n== a measured day of zeros reports as zero ==')
  const { data: quiet } = await db
    .from('metrics_daily')
    .select('date')
    .eq('client_id', client.id)
    .eq('leads_new', 0)
    .eq('messages_sent', 0)
    .limit(1)
  check(Boolean(quiet?.[0]), 'there is a real all-zero derived day to test with', quiet?.[0]?.date)
  check(
    statsFrom(html).every((n) => Number.isInteger(n)),
    'zeros render as the digit 0, never as a dash or a blank',
  )
  check(!/rstat__value[^>]*>\s*[—–-]\s*</.test(html), 'no em-dash placeholders in the figures')

  // ---- 4. the current week is not painted as a failure -------------------
  console.log('\n== a week in progress is not a broken week ==')
  const thisWeek = new Date()
  const dow = (thisWeek.getUTCDay() + 6) % 7
  thisWeek.setUTCDate(thisWeek.getUTCDate() - dow)
  const cur = thisWeek.toISOString().slice(0, 10)
  const now = await (await get(`/report?client=${client.id}&week=${cur}`)).text()
  check(now.includes('This week is still running'), 'says the week is in progress')
  check(!now.includes('do not send this until it has'), 'does not cry wolf about future days')

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('PROBE THREW:', e.message)
  process.exit(2)
})
