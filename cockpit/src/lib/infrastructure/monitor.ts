/**
 * Better Stack's ONE line (brief §2.4 "Reads", mindmap §4.9), and nothing more.
 *
 *   🔴 WE DO NOT REBUILD THE DASHBOARD. Better Stack already has history,
 *      incident timelines and uptime percentages. This asks one question — are
 *      the monitors up — and offers a link through. No charts, no history, no
 *      incident list.
 *   🔴 S3, THE WHOLE POINT: "we could not ask the monitor" is NOT "the monitor
 *      says nothing is wrong". A missing token, a timeout, a 500 and a bad
 *      payload all land in `asked: false`, which the screen renders as a state
 *      that cannot be read as reassurance. This is the same rule as the stale
 *      health stamp above it, and the same rule as `notCheckedFor` on
 *      /ops/expiries: an unasked question never renders as a good answer.
 *
 * The API (from Better Stack's own docs, read 22 Sep 2026 via context7:
 * betterstack.com/docs/uptime/api/list-all-existing-monitors and
 * /monitors-api-response-params):
 *
 *   GET https://uptime.betterstack.com/api/v2/monitors
 *   Authorization: Bearer $TOKEN
 *   → { data: [ { id, attributes: { status, pronounceable_name, url, … } } ] }
 *
 * `status` is one of: up, down, validating, paused, pending, maintenance.
 * 🔒 Only those documented fields are read. A field we have not seen documented
 * is a field we cannot promise is there, and a line built on a guess is the
 * same lie as a stale date.
 */

/** The documented states, plus a catch-all for one we have not seen. */
export type MonitorStatus = 'up' | 'down' | 'validating' | 'paused' | 'pending' | 'maintenance' | 'unknown'

export type MonitorSeen = { name: string; status: MonitorStatus; url: string | null }

export type MonitorLine =
  /** 🔴 S3: we could not ask. NEVER a green line, whatever the reason. */
  | { asked: false; why: string; askedAt: string }
  | { asked: true; askedAt: string; monitors: MonitorSeen[] }

export const MONITORS_URL = 'https://uptime.betterstack.com/api/v2/monitors'
export const BETTER_STACK_LINK = 'https://uptime.betterstack.com/'
const DOCUMENTED: MonitorStatus[] = ['up', 'down', 'validating', 'paused', 'pending', 'maintenance']

/** What the API gave back, as little of it as this line needs. */
export type MonitorFetch =
  | { ok: true; body: unknown }
  | { ok: false; why: string }

/** Pure: the payload in, the line out. Nothing here throws and nothing fetches. */
export function monitorLine(res: MonitorFetch, askedAt: Date): MonitorLine {
  const at = askedAt.toISOString()
  if (!res.ok) return { asked: false, why: res.why, askedAt: at }
  const data = (res.body as { data?: unknown } | null)?.data
  // 🔒 A shape we do not recognise is NOT an empty list of problems.
  if (!Array.isArray(data)) return { asked: false, why: 'Better Stack answered in a shape this screen does not recognise.', askedAt: at }
  const monitors: MonitorSeen[] = data.map((m) => {
    const a = (m as { attributes?: Record<string, unknown> }).attributes ?? {}
    const status = String(a.status ?? '')
    return {
      name: String(a.pronounceable_name ?? a.url ?? 'a monitor'),
      status: (DOCUMENTED as string[]).includes(status) ? (status as MonitorStatus) : 'unknown',
      url: typeof a.url === 'string' ? a.url : null,
    }
  })
  return { asked: true, askedAt: at, monitors }
}

/**
 * 🔴 HOW LONG THE SCREEN WILL WAIT FOR SOMEBODY ELSE'S SERVER (Stage 2,
 * 23 Sep 2026).
 *
 * This was the ONLY outbound fetch on any render path with no timeout at all,
 * while every other fetch in the codebase sets one (lib/actions.ts uses 25s,
 * 20s and 35s). It sits inside a Promise.all with the health-run read, so
 * Better Stack's latency simply WAS this page's latency, with no ceiling: a
 * hung connection would have held /ops/infrastructure open until the platform
 * killed the function.
 *
 * Four seconds, and the number has a reason. This screen is read when
 * something is wrong, so the answer is wanted quickly; and the failure is not
 * a failure of the screen — S3 already says every un-asked reason lands on
 * "we could not ask the monitor", which is never mistaken for "nothing is
 * wrong". A timeout is one more way of not having asked, and it says so.
 */
export const MONITOR_TIMEOUT_MS = 4_000

/**
 * The one call. The token is the operator's, from the environment; absent, we
 * say we could not ask — which is exactly what it means.
 */
export async function askTheMonitor(now: Date, fetcher: typeof fetch = fetch): Promise<MonitorLine> {
  const token = process.env.BETTERSTACK_API_TOKEN ?? ''
  if (!token.trim()) {
    return monitorLine({ ok: false, why: 'No Better Stack token is configured here, so the monitor was not asked.' }, now)
  }
  try {
    const r = await fetcher(MONITORS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(MONITOR_TIMEOUT_MS),
    })
    if (!r.ok) return monitorLine({ ok: false, why: `Better Stack answered HTTP ${r.status}.` }, now)
    return monitorLine({ ok: true, body: await r.json() }, now)
  } catch (e) {
    /*
     * 🔒 A TIMEOUT SAYS SO IN ITS OWN WORDS. "could not be reached (The
     * operation was aborted)" reads like something we did; the operator needs
     * to know the monitor was slow, not that the cockpit gave up at random.
     */
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    const why = timedOut
      ? `Better Stack did not answer within ${Math.round(MONITOR_TIMEOUT_MS / 1000)} seconds.`
      : `Better Stack could not be reached (${e instanceof Error ? e.message : 'unknown error'}).`
    return monitorLine({ ok: false, why }, now)
  }
}
