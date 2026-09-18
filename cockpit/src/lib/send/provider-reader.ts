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
import { toChannelAddress, stripChannelAddress } from '@/lib/send/provider-address'

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

/**
 * Addresses go out prefixed and come back stripped, through
 * `provider-address.ts`. That module's header explains why, and it is the
 * place to read before writing any provider query — including the next one,
 * in whatever file it lives.
 */

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
    From: toChannelAddress(params.from),
    'DateSent>': params.sentAfter.toISOString(),
    'DateSent<': params.sentBefore.toISOString(),
    PageSize: String(params.pageSize ?? 200),
  })
  if (params.to) q.set('To', toChannelAddress(params.to))

  let url: string | null =
    `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT()}/Messages.json?${q.toString()}`
  const out: ProviderMessage[] = []
  let pages = 0

  while (url) {
    const page = (await getJson(url)) as { messages?: TwilioMessage[]; next_page_uri?: string | null }
    for (const m of page.messages ?? []) {
      out.push({
        sid: m.sid,
        // Stripped, so everything inland compares against bare E.164.
        to: stripChannelAddress(m.to),
        from: stripChannelAddress(m.from),
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

/** Re-exported for callers that already reach for them here. One definition, in
 * provider-address.ts (lesson 15). */
export { toChannelAddress, stripChannelAddress } from '@/lib/send/provider-address'

/**
 * The sender's quality rating, from the Senders API v2.
 *
 * IN THIS FILE RATHER THAN ITS OWN, deliberately. A separate sender-reader.ts
 * was written first and deleted: it would have been a SECOND file naming the
 * read credential and a SECOND file calling the provider by URL, and
 * one-sender.test.ts asserts exactly one of each. Widening those to two would
 * have been the first step of the sequence that ends at "some" — and the
 * boundary is worth more than the tidiness of one file per resource.
 *
 * The key covers both: Messaging → `messages` Read+List and `whatsapp-senders`
 * Read+List, nothing else in any product. It cannot create.
 *
 * `null` means UNREADABLE, which the halt treats as a stop. This returns null
 * rather than throwing on a bad response because the caller halts either way,
 * and the halt reason needs to distinguish "no rating" from "the request
 * failed" — both of which arrive here as null and are separated by the caller's
 * own try/catch around a throw. See quality.ts.
 */
export async function qualityRating(senderSid: string): Promise<string | null> {
  const json = (await getJson(
    `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`,
  ).catch(() => null)) as { properties?: { quality_rating?: string } } | null

  return json?.properties?.quality_rating ?? null
}
