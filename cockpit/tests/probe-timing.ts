/*
 * How long a tap takes, and where the time goes.
 *
 * WHY THIS EXISTS. "Page transitions feel laggy" was reported as an animation
 * problem. It was not. Measured against production, /leads took 730–1050ms and
 * /report 730–900ms to send their FIRST byte, so a tap did nothing at all for
 * about a second. Adding a transition over that would have made it worse.
 *
 * Three causes, all measurable, none of them animation:
 *
 *   1. GEOGRAPHY. Vercel functions ran in iad1 (Washington) against a Supabase
 *      project in Frankfurt (docs/phase-0-infrastructure-handoff.md). Every
 *      query crossed the Atlantic. Fixed by pinning `regions: ["fra1"]`.
 *   2. ROUND TRIPS. Every screen ran the full getQueue() — client names, last
 *      inbound message, replies-since-escalation — to render one integer on a
 *      tab badge. Replaced with getOpenCount().
 *   3. NO STREAMING BOUNDARY. Only /queue had a loading.tsx. Without one,
 *      Next.js sends nothing until the whole render finishes: first byte and
 *      last byte arrive together. Every route has one now.
 *
 * WHAT IT ASSERTS
 *   - every route flushes its shell close to the no-database baseline (/login)
 *   - every route that queries the database actually STREAMS: its body lands
 *     measurably after its head. Delete a loading.tsx and this collapses to
 *     zero, which is the failure this check exists to catch.
 *
 * Totals are reported, not asserted. They depend on the network between this
 * machine and the edge, and a threshold that moves with the weather is a
 * threshold nobody trusts.
 *
 *   PROBE_BASE=https://ryvo-cockpit.vercel.app npx tsx tests/probe-timing.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { appRoutes } from './lib/routes'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const BASE = process.env.PROBE_BASE ?? 'https://ryvo-cockpit.vercel.app'
const SAMPLES = 5

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

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** Time to the first byte of the response, and to the last. */
async function time(path: string, cookie: string) {
  const t0 = performance.now()
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' })
  const reader = res.body!.getReader()
  const first = await reader.read()
  const ttfb = performance.now() - t0
  if (!first.done) while (!(await reader.read()).done) {}
  return { ttfb, total: performance.now() - t0, status: res.status }
}

async function main() {
  const email = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink failed: ${error.message}`)
  const hash = (data!.properties as { hashed_token: string }).hashed_token
  const cb = await fetch(`${BASE}/auth/callback?token_hash=${hash}&type=magiclink`, {
    redirect: 'manual',
  })
  const cookie = (cb.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error(`no session cookie — is the app running at ${BASE}?`)

  const { data: lead } = await db.from('leads').select('id').limit(1)
  // Derived from src/app — see tests/lib/routes.ts and the near-miss it exists
  // for. /login stays first because it is the no-database baseline.
  const BY_ROUTE: Record<string, string> = { '/leads/[id]': lead?.[0]?.id ?? '' }
  if (process.env.PROBE_IMPORT_BATCH) BY_ROUTE['/import/[id]'] = process.env.PROBE_IMPORT_BATCH
  const derived = appRoutes({ byRoute: BY_ROUTE }).filter((r) => !r.startsWith('SKIPPED:'))
  const ROUTES = ['/login', ...derived.filter((r) => r !== '/login' && r !== '/')]

  console.log(`\nNavigation timing — ${BASE}, median of ${SAMPLES}\n`)
  console.log('   route                     first byte      complete      streamed')

  const out: Record<string, { ttfb: number; total: number }> = {}
  for (const p of ROUTES) {
    const runs: { ttfb: number; total: number }[] = []
    for (let i = 0; i < SAMPLES; i++) runs.push(await time(p, cookie))
    const ttfb = median(runs.map((r) => r.ttfb))
    const total = median(runs.map((r) => r.total))
    out[p] = { ttfb, total }
    const label = p.length > 24 ? p.slice(0, 21) + '…' : p
    console.log(
      `   ${label.padEnd(24)}  ${`${Math.round(ttfb)}ms`.padStart(8)}` +
        `      ${`${Math.round(total)}ms`.padStart(8)}` +
        `      ${`${Math.round(total - ttfb)}ms`.padStart(8)}`,
    )
  }

  console.log('')

  // /login touches no database and has no skeleton, so its first byte is the
  // pure cost of getting to the function and back. Everything else is measured
  // against it rather than against a number typed in here.
  const baseline = out['/login'].ttfb
  for (const p of ROUTES.filter((r) => r !== '/login')) {
    check(
      out[p].ttfb <= baseline + 120,
      `${p} flushes its shell at the no-database baseline`,
      `${Math.round(out[p].ttfb)}ms vs ${Math.round(baseline)}ms baseline`,
    )
  }

  console.log('')
  for (const p of ['/queue', '/leads', '/report', '/health']) {
    const gap = out[p].total - out[p].ttfb
    check(
      gap > 20,
      `${p} streams — its body lands after its head`,
      gap > 20
        ? `${Math.round(gap)}ms apart`
        : 'head and body arrived together, so nothing is streaming; has loading.tsx been removed?',
    )
  }

  // The control, and it is a real one: /login has no loading.tsx, so its head
  // and body arrive together. If that gap were also large, the measurement
  // above would be measuring something other than streaming.
  const loginGap = out['/login'].total - out['/login'].ttfb
  check(
    loginGap < 20,
    'the streaming measurement can tell a non-streaming route apart',
    `/login (no skeleton) arrives in one piece, ${Math.round(loginGap)}ms apart`,
  )

  console.log(`\n  ${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
