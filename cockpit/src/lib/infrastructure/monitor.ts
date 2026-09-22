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
 * The one call. The token is the operator's, from the environment; absent, we
 * say we could not ask — which is exactly what it means.
 */
export async function askTheMonitor(now: Date, fetcher: typeof fetch = fetch): Promise<MonitorLine> {
  const token = process.env.BETTERSTACK_API_TOKEN ?? ''
  if (!token.trim()) {
    return monitorLine({ ok: false, why: 'No Better Stack token is configured here, so the monitor was not asked.' }, now)
  }
  try {
    const r = await fetcher(MONITORS_URL, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!r.ok) return monitorLine({ ok: false, why: `Better Stack answered HTTP ${r.status}.` }, now)
    return monitorLine({ ok: true, body: await r.json() }, now)
  } catch (e) {
    return monitorLine({ ok: false, why: `Better Stack could not be reached (${e instanceof Error ? e.message : 'unknown error'}).` }, now)
  }
}
