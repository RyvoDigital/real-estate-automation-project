import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

import { admin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * The deep health check — improvements §3.7, Layer 3.
 *
 * Polled from OUTSIDE (Better Stack, every few minutes) and hosted on Vercel,
 * so it is independent of the Hetzner box and of n8n. It answers one question:
 * is the platform database reachable and answering a real query. The server's
 * own health check asks the same question every 10 minutes, but it runs on the
 * server, so it says nothing when the server is what died — and a Supabase
 * free-tier pause otherwise gives no signal at all while the backup log stays
 * green. This is the answer to that.
 *
 * 200 when the query succeeds, 503 when it does not. One failure, one monitor:
 * the age of the newest server health run rides along in the body for a human
 * to read, but does not affect the status — the server going quiet is the
 * heartbeat monitor's job, and two alerts for one outage is how alerting gets
 * muted.
 *
 * It exposes nothing beyond its own existence. The token header is checked
 * before Supabase is touched, so the endpoint cannot be used to drive load
 * against the database, and the body carries no ids, names or counts — only
 * ok, the check names and milliseconds. The service role never leaves the
 * server side.
 */

function authed(req: Request): boolean {
  const want = process.env.RYVO_HEALTH_TOKEN ?? ''
  const given = req.headers.get('x-ryvo-health-token') ?? ''
  if (!want || want.length !== given.length) return false
  return timingSafeEqual(Buffer.from(want), Buffer.from(given))
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  if (!authed(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401, headers: NO_STORE })
  }

  const at = new Date().toISOString()
  const t0 = Date.now()
  let supabase: 'ok' | 'fail' = 'fail'
  let error: string | null = null
  let serverHealthAgeMin: number | null = null

  try {
    const db = admin()
    // The same query the server health check runs: a real read, one row, no
    // content returned to the caller.
    const probe = await db.from('clients').select('id').limit(1)
    if (probe.error) throw new Error(probe.error.message)
    supabase = 'ok'

    // Informational only. If this read fails the status stays whatever the
    // probe said; a missing row is reported as null, never as a failure.
    const hr = await db.from('health_runs').select('ran_at').order('ran_at', { ascending: false }).limit(1)
    const ranAt = hr.data?.[0]?.ran_at as string | undefined
    if (!hr.error && ranAt) serverHealthAgeMin = Math.round((Date.now() - new Date(ranAt).getTime()) / 60000)
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : 'unknown'
  }

  const latencyMs = Date.now() - t0
  const ok = supabase === 'ok'
  return NextResponse.json(
    {
      ok,
      at,
      checks: { supabase, latency_ms: latencyMs, error },
      server_health_age_min: serverHealthAgeMin,
    },
    { status: ok ? 200 : 503, headers: NO_STORE },
  )
}
