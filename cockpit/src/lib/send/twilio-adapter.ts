import 'server-only'

import type { ProviderAdapter } from '@/lib/send/dispatch'
import { toChannelAddress } from '@/lib/send/provider-address'

/**
 * The one file that can cause a message to exist.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ IT HAS NO ROUTE TO A RECIPIENT OF ITS OWN.                              │
 * │                                                                         │
 * │ Every value it sends arrives as an argument from `dispatch`, which      │
 * │ received them from a `SendPermit`, which only exists because a row was  │
 * │ inserted that satisfied 0015's constraints. This file reads no table,   │
 * │ takes no list, resolves no segment and has no default anything. Given   │
 * │ only the credential it cannot name a single person to send to.          │
 * │                                                                         │
 * │ That is the last link of the chain: the gate decides who, the record    │
 * │ makes the permit possible, the permit is the only argument dispatch     │
 * │ accepts, and this is the only file with the credential.                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * THE CHANNEL PREFIX, AND WHY IT IS NOT THE SAME BUG AS THE READER'S
 * Both addresses convert through provider-address.ts. Checked 18 Sep 2026, and
 * the failure modes are opposite:
 *
 *   QUERY   From=+14155238886  ->  HTTP 200 and zero messages. SILENT.
 *   CREATE  To=+351912345678 with a whatsapp: From
 *           ->  error 21910, "Invalid 'From' and 'To' pair. 'From' and 'To'
 *               should be of the same channel". LOUD.
 *
 * So this path is not a second instance of the reader's defect: a mistake here
 * announces itself. Recorded because the asymmetry is the reason the read-side
 * version survived unnoticed — the same class of error is loud on the write
 * path and silent on the read path, and only the read path had no test that
 * could tell an empty answer from a wrong question.
 *
 * WHY ContentSid AND NOT Body
 * Outside the 24-hour window WhatsApp carries approved templates only. Twilio
 * sends those by content id with variables, and renders the text itself — so
 * `bodySent` comes back from the API rather than from our copy, which is what
 * the reconciliation comparison wants (the wire, not the variable).
 */

const API = 'https://api.twilio.com/2010-04-01'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`twilio-adapter: ${name} is not set`)
  return v
}

export type TwilioAdapterDeps = {
  /** Injected so the whole adapter is testable without a network. */
  fetchImpl?: typeof fetch
}

export function twilioAdapter(deps: TwilioAdapterDeps = {}): ProviderAdapter {
  const doFetch = deps.fetchImpl ?? fetch

  return {
    isConfigured: () =>
      Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_SEND_KEY_SID && process.env.TWILIO_SEND_KEY_SECRET),

    async send(input) {
      const accountSid = required('TWILIO_ACCOUNT_SID')
      const keySid = required('TWILIO_SEND_KEY_SID')
      const keySecret = required('TWILIO_SEND_KEY_SECRET')
      const auth = Buffer.from(`${keySid}:${keySecret}`).toString('base64')

      const form = new URLSearchParams({
        // Both prefixed. A bare pair is error 21910, and a converted pair
        // cannot produce it.
        To: toChannelAddress(input.to),
        From: toChannelAddress(input.from),
        ContentSid: input.contentSid,
      })
      if (input.variables && Object.keys(input.variables).length > 0) {
        form.set('ContentVariables', JSON.stringify(input.variables))
      }

      let res: Response
      try {
        res = await doFetch(`${API}/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        })
      } catch (e) {
        // NO ANSWER. Thrown rather than returned, because `dispatch` treats a
        // throw as ambiguous and a return as an answer — and silence must never
        // be mistaken for a refusal. It may have been accepted and delivered.
        throw new Error(`no answer from Twilio: ${e instanceof Error ? e.message : String(e)}`)
      }

      const json = (await res.json().catch(() => ({}))) as {
        sid?: string; body?: string; status?: string; code?: number; message?: string
      }

      if (res.ok && json.sid) {
        return {
          accepted: true,
          providerMessageId: json.sid,
          // From the API's own copy. Empty would mean Twilio rendered nothing
          // it will tell us about, which is a finding rather than a default —
          // so it is passed through as received rather than backfilled with our
          // text, which would make the record agree with itself by construction.
          bodySent: json.body ?? '',
        }
      }

      const detail = `${res.status} ${json.code ?? ''} ${json.message ?? ''}`.trim()

      // 429 is the ONE retryable answer. Everything else Twilio answers is
      // terminal: the same content would be rejected identically.
      if (res.status === 429) return { accepted: false, retryable: 'later', error: detail }

      // A 5xx is Twilio saying it failed, which is an ANSWER — but not one that
      // tells us whether the message was accepted first. Treated as no answer,
      // so the row stays `intended` for reconciliation rather than being
      // recorded as a definite failure.
      if (res.status >= 500) throw new Error(`Twilio ${res.status}: ${detail || 'no body'}`)

      return { accepted: false, retryable: 'never', error: detail }
    },
  }
}
