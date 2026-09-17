import 'server-only'

/**
 * Reading the provider's message log. THIS FILE CANNOT SEND, AND NOT BY
 * CONVENTION.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ TWO INDEPENDENT REASONS IT CANNOT SEND, AND THE FIRST IS THE REAL ONE.  │
 * │                                                                         │
 * │ 1. THE CREDENTIAL. TWILIO_READ_KEY_* is a Restricted API Key scoped to  │
 * │    Messaging → messages → Read and List, with nothing ticked in any     │
 * │    other product. It CANNOT create a message. Twilio refuses from the   │
 * │    other side of the network, and no edit in this repository changes    │
 * │    that. The boundary is the key, not the code.                         │
 * │                                                                         │
 * │ 2. THE SHAPE. The Twilio SDK is NOT imported here. There is no          │
 * │    `client.messages.create` in scope to reach for — not a call that     │
 * │    would fail confusingly at runtime, but no call at all. The only      │
 * │    route to the network in this file is `getJson`, which hardcodes      │
 * │    GET and takes no body.                                               │
 * │                                                                         │
 * │ Reason 2 exists because reason 1 alone would leave a future edit        │
 * │ reaching `create()` and receiving a 403 — a confusing runtime error     │
 * │ where the honest outcome is that the call was never available.          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * `one-sender.test.ts` asserts the mirror of this: the SENDING credential may
 * appear in exactly one file and it is not this one, and the READ credential
 * may appear in exactly one file and it is not the dispatcher. Two assertions,
 * not one weakened into "at most two files hold a Twilio credential".
 */

import type { ProviderMessage } from '@/lib/send/match'

const ACCOUNT = () => required('TWILIO_ACCOUNT_SID')
const KEY_SID = () => required('TWILIO_READ_KEY_SID')
const KEY_SECRET = () => required('TWILIO_READ_KEY_SECRET')

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    // Loud rather than a silent empty listing: an unauthenticated or
    // misconfigured read returns nothing, and "no messages" is exactly what a
    // broken query looks like (match.ts says so at length). A missing
    // credential must never reach the matcher as an empty result.
    throw new Error(`provider-reader: ${name} is not set. A missing credential would read as "no messages sent".`)
  }
  return v
}

/**
 * The ONLY route to the network in this file.
 *
 * Hardcodes GET, accepts no body, and is not parameterised by method. Adding a
 * POST here is not an edit to an argument — it is writing a second network call
 * by hand, which is visible in review and caught by one-sender.test.ts.
 */
async function getJson(url: string): Promise<unknown> {
  const auth = Buffer.from(`${KEY_SID()}:${KEY_SECRET()}`).toString('base64')
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`provider-reader: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`)
  }
  return res.json()
}

type TwilioMessage = {
  sid: string
  to: string
  from: string
  body: string
  date_sent: string | null
  date_created: string
  direction: string
  status: string
}

/**
 * Messages between one client number and one contact, in a window.
 *
 * Paginated to exhaustion deliberately: a truncated listing is an empty-ish
 * result, and the matcher would read "no match" from a page boundary. The
 * matcher cannot tell a short page from an absence, so this must not hand it
 * one.
 */
export async function listMessages(params: {
  from: string
  to?: string
  sentAfter: Date
  sentBefore: Date
  pageSize?: number
}): Promise<ProviderMessage[]> {
  const q = new URLSearchParams({
    From: params.from,
    'DateSent>': params.sentAfter.toISOString(),
    'DateSent<': params.sentBefore.toISOString(),
    PageSize: String(params.pageSize ?? 200),
  })
  if (params.to) q.set('To', params.to)

  let url: string | null =
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT()}/Messages.json?${q.toString()}`
  const out: ProviderMessage[] = []
  let pages = 0

  while (url) {
    const page = (await getJson(url)) as { messages?: TwilioMessage[]; next_page_uri?: string | null }
    for (const m of page.messages ?? []) {
      out.push({
        sid: m.sid,
        to: m.to,
        from: m.from,
        body: m.body,
        // date_sent is null until the provider actually sends it; date_created
        // is when it accepted the request. The matcher compares against our
        // intent time, so the accept time is the right one to fall back to —
        // and falling back is stated rather than silent.
        dateSent: m.date_sent ?? m.date_created,
        direction: m.direction,
        status: m.status,
      })
    }
    url = page.next_page_uri ? `https://api.twilio.com${page.next_page_uri}` : null
    pages += 1
    if (pages > 50) {
      // A window that needs more than fifty pages is a window that is wrong.
      // Refusing beats returning a partial list the matcher would read as an
      // absence.
      throw new Error('provider-reader: more than 50 pages for one window — the window is wrong')
    }
  }
  return out
}
