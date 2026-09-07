/*
 * Proves BOTH renderings of the health screen — fresh and stale — because
 * §5.6's requirement is that a stale screen looks stale, and that is a
 * branch which fails silently: a screen stuck on an old green result looks
 * exactly like a healthy system.
 *
 * The stale branch is forced with HEALTH_STALE_MINUTES=0 rather than by
 * back-dating a row. Nothing is written to the database to test a view.
 *
 *   npm start                                   # then, in another shell:
 *   npx tsx tests/probe-health.ts               # expects fresh
 *   EXPECT_STALE=1 HEALTH_STALE_MINUTES=0 …     # server started with 0
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const wantStale = process.env.EXPECT_STALE === '1'

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

async function main() {
  const { data: runs } = await db
    .from('health_runs')
    .select('passed, failed, ran_at')
    .order('ran_at', { ascending: false })
    .limit(1)

  const run = runs?.[0]
  check(Boolean(run), 'health_runs has a row', run ? String(run.ran_at) : 'none')
  if (!run) process.exit(1)

  const expected = (run.passed as string[]).length + (run.failed as string[]).length
  check(expected === 12, 'the producer published all twelve checks', `${expected}`)

  const email = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()
  const { data } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  const cb = await fetch(
    `${BASE}/auth/callback?token_hash=${(data!.properties as { hashed_token: string }).hashed_token}&type=magiclink`,
    { redirect: 'manual' },
  )
  const cookie = (cb.headers.getSetCookie?.() ?? [])[0]?.split(';')[0] ?? ''

  const res = await fetch(`${BASE}/health`, { headers: { cookie } })
  const html = await res.text()

  check(res.status === 200, 'health renders', String(res.status))

  // Count the ROW class, not a substring inside it: hcheck__dot appears in
  // both the HTML and the inlined RSC payload, so counting it double-counts.
  // The property is "one row per check", so measure that.
  const rows = (html.match(/class="hcheck"/g) ?? []).length + (html.match(/class="hcheck hcheck--bad"/g) ?? []).length
  check(rows === expected, 'every check the producer published is on the page', `${rows}/${expected}`)

  check(html.includes('This page rendered'), 'the render time is printed absolutely, not only relatively')

  const isStale = html.includes('hstamp--stale')
  check(isStale === wantStale, wantStale ? 'stale styling applied' : 'stale styling absent')
  check(
    html.includes('it is telling you nothing') === wantStale,
    wantStale ? 'stale screen says it is telling you nothing' : 'no false stale warning',
  )

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('PROBE THREW:', e.message)
  process.exit(2)
})
