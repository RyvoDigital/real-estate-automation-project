import 'server-only'
import { admin } from '@/lib/supabase/admin'
import { askTheMonitor } from './monitor'
import { buildInfrastructure, type HealthRun, type Infrastructure } from './model'

/**
 * The two reads brief §2.4 allows, and no others: the most recent health_runs
 * row, and one call to Better Stack.
 *
 * 🔴 A FAILED READ IS RETURNED, NEVER THROWN. getHealth() throws, which on this
 * screen would render an error page — and an error page cannot say the thing
 * that matters, which is that the checks are unknown rather than failing (S4).
 */
export async function readInfrastructure(now: Date): Promise<Infrastructure> {
  const [health, monitor] = await Promise.all([
    admin().from('health_runs').select('ran_at, ok, passed, failed, duration_ms, host').order('ran_at', { ascending: false }).limit(1),
    askTheMonitor(now),
  ])

  if (health.error) return buildInfrastructure({ run: null, failure: `health_runs: ${health.error.message}`, monitor, now })
  const r = (health.data ?? [])[0]
  const run: HealthRun | null = r
    ? { ranAt: r.ran_at as string, ok: Boolean(r.ok), passed: (r.passed as string[]) ?? [], failed: (r.failed as string[]) ?? [],
        durationMs: (r.duration_ms as number) ?? null, host: (r.host as string) ?? null }
    : null
  return buildInfrastructure({ run, failure: null, monitor, now })
}
