import 'server-only'

import { admin } from '@/lib/supabase/admin'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * CONTACTS WITH SOMETHING CURRENTLY WRONG — and nothing else.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Operator's rule, 20 September 2026, setting the shape of `/c/<client>/contacts`:
 * a search, plus a short attention set. A screen that is only a search has no
 * reason to be open unless you already have a number, and that is the screen
 * nobody remembers exists.
 *
 * 🔴 AND THE RULE THAT STOPS IT BECOMING THE BROWSABLE LIST BY ANOTHER NAME.
 * Every contact here is here because SOMETHING ABOUT THEM NEEDS DOING:
 *
 *   an unresolved send        we do not know whether they received a message
 *   a recent refusal          within the window below
 *   a quarantined claim       our own correction, awaiting an answer
 *
 * Never "recently active", never "most messaged", never "most leads" — those
 * are a browse wearing a filter. The contact record carries the consent
 * ledger, which §1.2 says is read with the agency one contact at a time; a
 * browsable index of every number an agency holds is also the thing most
 * likely to be screenshotted.
 *
 * 🔒 AND THE CAP IS STATED, NEVER APPLIED SILENTLY. A list of ten meaning "ten"
 * and a list of ten meaning "at least ten" are different facts, and this
 * project has spent three days on that distinction in four other places.
 */

/**
 * 🔴 SEVEN DAYS, AND THE REASON IS THE MATCH RATHER THAN THE NUMBER.
 *
 * `ANOMALY_WINDOW_DAYS` is also 7. Two screens that both answer "what needs
 * doing" disagreeing about what *recent* means is a defect nobody would ever
 * diagnose — they would simply, quietly, mean different things, and an
 * operator would carry two incompatible ideas of the same word between two
 * tabs.
 *
 * **Falsifier:** a refusal routinely matters for longer than a week — a policy
 * confirmation lands and the refusals it invalidates are three weeks old — or
 * the set is empty so often that the screen stops being opened. Either is a
 * reason to change it; neither is a reason to change it in only one of the two
 * places, and a test asserts they agree.
 */
export const ATTENTION_WINDOW_DAYS = Number(process.env.ANOMALY_WINDOW_DAYS ?? 7)

/** Stated on the page, never silently applied. */
export const ATTENTION_CAP = 25

export type AttentionReason = 'unresolved_send' | 'recent_refusal' | 'quarantined_claim'

export const REASON_MEANS: Record<AttentionReason, string> = {
  unresolved_send: 'we do not know whether a message reached them',
  recent_refusal: 'a send was refused in the last week',
  quarantined_claim: 'we corrected a record we should not have written, and it is unanswered',
}

export type AttentionRow = {
  e164: string
  reasons: AttentionReason[]
  /** The most recent moment any of its reasons applied, for ordering. */
  at: string
}

export type AttentionSet = {
  rows: AttentionRow[]
  /** 🔒 True means "at least this many", and the page says so in those words. */
  capped: boolean
  windowDays: number
} | null

export async function readAttention(clientId: string): Promise<AttentionSet> {
  try {
    const db = admin()
    const since = new Date(Date.now() - ATTENTION_WINDOW_DAYS * 86_400_000).toISOString()

    const [unresolved, refused, quarantined] = await Promise.all([
      /*
       * 🔒 NOT windowed. "We do not know whether this person received a
       * message" does not stop being true after a week — it stops being true
       * when somebody reconciles it. Windowing this one would quietly retire
       * the only state on the screen that never resolves itself.
       */
      db
        .from('sends')
        .select('phone_e164, intent_recorded_at')
        .eq('client_id', clientId)
        .eq('status', 'unresolved')
        .order('intent_recorded_at', { ascending: false })
        .limit(200),
      db
        .from('sends')
        .select('phone_e164, gate_decided_at')
        .eq('client_id', clientId)
        .eq('gate_verdict', 'refused')
        .gte('gate_decided_at', since)
        .order('gate_decided_at', { ascending: false })
        .limit(200),
      db
        .from('consent_events')
        .select('phone_e164, recorded_at')
        .eq('client_id', clientId)
        .eq('kind', 'quarantined')
        .order('recorded_at', { ascending: false })
        .limit(200),
    ])
    if (unresolved.error || refused.error || quarantined.error) throw new Error('attention read failed')

    const by = new Map<string, AttentionRow>()
    const add = (phone: string, at: string, reason: AttentionReason) => {
      const row = by.get(phone)
      if (!row) {
        by.set(phone, { e164: phone, reasons: [reason], at })
        return
      }
      if (!row.reasons.includes(reason)) row.reasons.push(reason)
      if (at > row.at) row.at = at
    }

    for (const r of unresolved.data ?? []) add(r.phone_e164, r.intent_recorded_at, 'unresolved_send')
    for (const r of refused.data ?? []) add(r.phone_e164, r.gate_decided_at, 'recent_refusal')
    for (const r of quarantined.data ?? []) add(r.phone_e164, r.recorded_at, 'quarantined_claim')

    const all = [...by.values()].sort((a, b) => (a.at < b.at ? 1 : -1))
    return {
      rows: all.slice(0, ATTENTION_CAP),
      capped: all.length > ATTENTION_CAP,
      windowDays: ATTENTION_WINDOW_DAYS,
    }
  } catch {
    // 🔒 Null is not an empty set. "Nothing needs doing" and "we could not look"
    // are opposite claims, and the first is the one that makes a screen stop
    // being opened.
    return null
  }
}
