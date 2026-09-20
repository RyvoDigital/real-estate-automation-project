import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { getWeeklyReport, type WeeklyReport } from '@/lib/data'
import { weeklyFigures, type AttributedMessage, type LeadOutcome, type WeeklyFigures } from './attribution'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT DO I SEND THIS CLIENT ON MONDAY?
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief III §11, Q26.
 *
 * 🔴 COMMERCIALLY LOAD-BEARING, WHICH HERE IS THE SAME WEIGHT AS LEGALLY. The
 * report is what the client relies on. An overstated number is a
 * misrepresentation inside a paid relationship, not a display bug.
 *
 * 🔴 A WEEK WITH A MISSING DAY YIELDS NO FIGURES AT ALL. Not a six-day total,
 * not zeros for the gap. The nightly derivation did not run, so any figure
 * covering that week is incomplete — and an incomplete figure presented as a
 * figure is a number computed as though it were a fact about the world (§5j),
 * in the one document somebody is paying for.
 */

export type WeekView = {
  report: WeeklyReport
  /**
   * 🔒 Null when any day of the week is `missing`. The absence is the design:
   * a caller cannot render figures it was not given.
   */
  figures: WeeklyFigures | null
  /** The days that made the figures unavailable, named so the gap is findable. */
  withheldBecause: string[]
  /**
   * 🔴 A figure the data cannot support, which withholds the artefact for the
   * same reason a missing day does. Null when every line is derivable.
   */
  cannotDerive: { figure: string; why: string; whatWouldFix: string } | null
}

/** improvements §3.27. */
export const QUALIFICATION_NOT_DERIVABLE = {
  figure: 'qualified contacts, and the reactivation subset beneath it',
  why: 'Nothing records WHEN a contact became qualified. `leads.stage` is a current value, so a contact qualified in August would be counted into this week, and `metrics_daily.leads_qualified` is a daily count carrying no contact ids, so the reactivation subset beneath it cannot be derived at all.',
  whatWouldFix:
    'A `lead.qualified` event, written when the stage changes, with the lead id and the moment. Every other line on this report is already derived that way.',
}

export async function readWeek(clientId: string, weekStart: string): Promise<WeekView | null> {
  try {
    const report = await getWeeklyReport(clientId, weekStart)

    /*
     * 🔴 The check that decides whether any figure may exist. It is done BEFORE
     * the figures are computed rather than after, so there is no moment at
     * which a six-day total sits in a variable waiting to be rendered by
     * mistake.
     */
    if (report.missingDays.length > 0) {
      return { report, figures: null, withheldBecause: report.missingDays, cannotDerive: null }
    }

    /*
     * 🔴 AND A SECOND REASON TO WITHHOLD, FOUND WHILE BUILDING THIS.
     *
     * `weeklyFigures` needs per-lead outcomes: was this lead qualified, did it
     * book a meeting. Meetings are derivable — `viewing.booked` is a real event
     * with a timestamp, so it can be scoped to the week.
     *
     * QUALIFICATION IS NOT. There is no qualification event; `leads.stage` is a
     * CURRENT value, so a lead qualified in August would be counted into this
     * week, and `metrics_daily.leads_qualified` is a daily count with no lead
     * ids, so its campaign SUBSET cannot be derived at all.
     *
     * A zero subset is the tempting answer and it is the worst one: it would
     * understate Automation 02 — the figure §11 names as "the one under most
     * pressure to flatter" — inside a document the client is paying for. A
     * number we cannot derive is not a zero.
     *
     * So it is withheld by the SAME mechanism as a missing day, rather than by
     * a second one. improvements §3.27.
     */
    const end = new Date(`${report.end}T23:59:59.999Z`).toISOString()
    const start = new Date(`${report.start}T00:00:00.000Z`).toISOString()

    const [msgs, leads, booked] = await Promise.all([
      admin()
        .from('messages')
        .select('lead_id, attribution_state, created_at')
        .gte('created_at', start)
        .lte('created_at', end)
        .limit(5000),
      admin().from('leads').select('id').eq('client_id', clientId).limit(5000),
      admin()
        .from('events')
        .select('data, created_at')
        .eq('client_id', clientId)
        .eq('type', 'viewing.booked')
        .gte('created_at', start)
        .lte('created_at', end)
        .limit(2000),
    ])
    if (msgs.error || leads.error || booked.error) throw msgs.error ?? leads.error ?? booked.error

    const mine = new Set((leads.data ?? []).map((l) => l.id))
    const messages: AttributedMessage[] = (msgs.data ?? [])
      .filter((m) => m.lead_id === null || mine.has(m.lead_id))
      .map((m) => ({
        leadId: m.lead_id as string | null,
        attributionState: (m.attribution_state ?? 'unknown') as AttributedMessage['attributionState'],
        createdAt: m.created_at as string,
      }))

    const metWeek = new Set(
      (booked.data ?? [])
        .map((e) => (e.data as { lead_id?: string } | null)?.lead_id)
        .filter((v): v is string => Boolean(v)),
    )

    const outcomes: LeadOutcome[] = [...mine].map((leadId) => ({
      leadId,
      // 🔒 Never from `leads.stage`: that is a current value and would count an
      // August qualification into September's report.
      qualified: false,
      meetingBooked: metWeek.has(leadId),
    }))

    return {
      report,
      figures: weeklyFigures({ messages, outcomes }),
      withheldBecause: [],
      cannotDerive: QUALIFICATION_NOT_DERIVABLE,
    }
  } catch {
    return null
  }
}
