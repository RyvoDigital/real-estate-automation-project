/*
 * End to end, against the running app and the real database.
 *
 * The magic link goes to an inbox this session cannot read, so the session
 * is minted with the Admin API's generateLink — which produces the SAME
 * token_hash the emailed link carries, and hands it to the SAME
 * /auth/callback route a real click would hit. That matters: a test that
 * reached the queue by some other door would be testing a door nobody uses
 * (rule 1).
 *
 * Checks, in order:
 *   1. an allowlisted address completes the flow and reaches the queue
 *   2. the queue HTML contains the real escalated lead
 *   3. lead detail renders the real conversation
 *   4. a NON-allowlisted address is refused a session at the callback
 *   5. signing out actually ends the session
 *
 *   node node_modules/tsx/dist/cli.mjs tests/probe-e2e.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3000'
const ALLOWED = (process.env.COCKPIT_ALLOWED_EMAILS ?? '').split(',')[0].trim()

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

/** A cookie jar just good enough for one session. */
function jar() {
  const store = new Map<string, string>()
  return {
    absorb(res: Response) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const i = pair.indexOf('=')
        const k = pair.slice(0, i).trim()
        const v = pair.slice(i + 1).trim()
        if (v === '' || /Max-Age=0/i.test(raw)) store.delete(k)
        else store.set(k, v)
      }
    },
    header() {
      return [...store].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    size() {
      return store.size
    },
  }
}

async function signIn(email: string) {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error(`generateLink(${email}) failed: ${error.message}`)
  const hash = data.properties?.hashed_token
  if (!hash) throw new Error('generateLink returned no hashed_token')

  const j = jar()
  const res = await fetch(
    `${BASE}/auth/callback?token_hash=${encodeURIComponent(hash)}&type=magiclink`,
    { redirect: 'manual' },
  )
  j.absorb(res)
  return { jar: j, status: res.status, location: res.headers.get('location') ?? '' }
}

const get = (path: string, j: ReturnType<typeof jar>) =>
  fetch(`${BASE}${path}`, { headers: { cookie: j.header() }, redirect: 'manual' })

async function main() {
  console.log(`== target: ${BASE} ==\n`)
  console.log('== 1. allowlisted address completes the real callback ==')
  const good = await signIn(ALLOWED)
  check(good.status === 307 || good.status === 302, 'callback redirects', `${good.status}`)
  check(good.location.includes('/queue'), 'lands on the queue', good.location)
  check(good.jar.size() > 0, 'a session cookie was set', `${good.jar.size()} cookie(s)`)

  console.log('\n== 2. the queue renders real data ==')
  const q = await get('/queue', good.jar)
  const html = await q.text()
  check(q.status === 200, 'queue returns 200 when signed in', `${q.status}`)

  const { data: leads } = await db
    .from('leads')
    .select('id, full_name')
    .not('qualification->>escalated', 'is', null)
    .limit(50)

  check((leads ?? []).length > 0, 'there is at least one escalated lead to show', `${leads?.length}`)
  for (const l of leads ?? []) {
    const name = (l.full_name as string) ?? ''
    check(html.includes(name), `queue shows "${name}"`)
  }
  check(!html.includes('Nobody is waiting'), 'the empty state is NOT showing')
  check(html.includes('longest waiting first'), 'sort order is stated on screen')

  console.log('\n== 3. lead detail renders the real conversation ==')
  const leadId = (leads ?? [])[0]?.id as string | undefined
  if (!leadId) {
    check(false, 'no lead to open')
  } else {
    const d = await get(`/leads/${leadId}`, good.jar)
    const dh = await d.text()
    check(d.status === 200, 'lead detail returns 200', `${d.status}`)

    const { data: msgs } = await db
      .from('messages')
      .select('body, direction')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })

    check((msgs ?? []).length > 0, 'the lead has stored messages', `${msgs?.length}`)
    const shown = (msgs ?? []).filter((m) => m.body && dh.includes(String(m.body))).length
    check(
      shown === (msgs ?? []).length,
      'every stored message appears in the rendered page',
      `${shown}/${msgs?.length}`,
    )
    check(dh.includes('Read-only'), 'read-only state is stated, not implied')
  }

  console.log('\n== 4. a non-allowlisted address is refused ==')
  // generateLink creates the auth user as a side effect, so this one is
  // removed again below. A probe that leaves rows behind is a probe that
  // will one day be mistaken for real data.
  const intruder = 'zz-probe-intruder@example.com'

  // The user must exist AND be confirmed first. generateLink for an unknown
  // address yields a token that fails verification, which would block the
  // intruder for the wrong reason — a right answer with the mechanism under
  // test never touched (instance 7). Force the condition: give the intruder
  // a genuinely valid session token, and make the ALLOWLIST be what stops it.
  const { data: made, error: makeErr } = await db.auth.admin.createUser({
    email: intruder,
    email_confirm: true,
  })
  if (makeErr) throw new Error(`could not create probe user: ${makeErr.message}`)
  check(Boolean(made.user), 'intruder exists and is confirmed, so its token is valid')

  const bad = await signIn(intruder)
  check(bad.location.includes('denied'), 'callback redirects to denied', bad.location)
  const badQ = await get('/queue', bad.jar)
  check(
    badQ.status === 307 || badQ.status === 302,
    'and cannot reach the queue',
    `${badQ.status} -> ${badQ.headers.get('location')}`,
  )
  const { data: list } = await db.auth.admin.listUsers()
  const stray = list.users.find((u) => u.email === intruder)
  if (stray) await db.auth.admin.deleteUser(stray.id)
  const { data: after } = await db.auth.admin.listUsers()
  check(
    !after.users.some((u) => u.email === intruder),
    'the probe user was cleaned up',
    after.users.map((u) => u.email).join(', '),
  )

  console.log('\n== 5. sign-out ends the session ==')
  const out = await fetch(`${BASE}/auth/signout`, {
    method: 'POST',
    headers: { cookie: good.jar.header() },
    redirect: 'manual',
  })
  good.jar.absorb(out)
  const closed = await get('/queue', good.jar)
  check(
    closed.status === 307 || closed.status === 302,
    'queue is closed again after sign-out',
    `${closed.status}`,
  )

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('PROBE THREW:', e.message)
  process.exit(2)
})
