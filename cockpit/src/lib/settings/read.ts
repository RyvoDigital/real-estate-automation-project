import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { readAutomations, type AutomationsOrUnknown } from '@/lib/landing/automations'
import { parseWorkingHours, type WorkingHours } from '@/lib/onboarding'

/*
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CLIENT IS CONFIGURED TO DO, AND WHAT MAY BE CHANGED.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Brief III §12.
 *
 * 🔴 `client_automations.config` HOLDS NUMBERS THAT DECIDE WHO RECEIVES A
 * MESSAGE. It is the one place in the cockpit where brief I §0.3's
 * sensible-defaults rule does NOT apply, and §4.6 is why: a pre-filled number
 * collects a click and records it as the agency's own judgement.
 *
 * 🔒 A FIELD THAT CANNOT CHANGE HAS NO CONTROL, NOT A DISABLED ONE. The
 * WhatsApp number and the sender SID render as text with the reason beside
 * them. A disabled input still reads as one click from going (§0.4-7), and
 * `tests/settings-no-disabled.test.ts` asserts nothing on the page is
 * `disabled`, `readOnly` or `aria-disabled`.
 */

/** A field nobody may change, with why — rendered as text, never as a control. */
export type Frozen = { label: string; value: string | null; why: string }

export type CalendarState =
  | { state: 'not_checked'; sentence: string; trap: string }
  | { state: 'probed'; at: string; sentence: string }
  | { state: 'unprobeable'; sentence: string; error: string }

export type Settings = {
  clientId: string
  name: string
  /** The Concierge's config, as stored. Null where nothing has been written. */
  config: Record<string, unknown> | null
  /** Parsed back from what is stored, to show the reader what we understood. */
  workingHours: WorkingHours | null
  frozen: Frozen[]
  automations: AutomationsOrUnknown
  calendar: CalendarState
  at: string
}

/**
 * 🔴 THE CALENDAR'S THREE ANSWERS NEVER COLLAPSE INTO TWO.
 *
 *   probed and answering   we asked, and it replied
 *   could not be probed    the auth failed, and we know that
 *   NOBODY HAS LOOKED      which is where we are, because nothing in this repo
 *                          probes a calendar at all
 *
 * And the trap that makes the distinction load-bearing: a WRONG calendar id
 * returns **200 with `busy: []`**, which is indistinguishable from a completely
 * free calendar. So "no busy times" is never evidence that the id is right, and
 * a screen that showed two states would be inviting exactly that inference.
 *
 * 🔒 GREY, NOT AMBER. Amber means a clock is the reason (§0.5). "Nobody has
 * looked" has no clock in it; uncertainty and absence are never coloured. The
 * Stage B design drew this in amber and it was corrected during the build.
 */
function calendarState(config: Record<string, unknown> | null): CalendarState {
  const id = typeof config?.calendar_id === 'string' ? config.calendar_id : null
  return {
    state: 'not_checked',
    sentence: id
      ? 'Nobody has asked this calendar whether it answers. Nothing in the cockpit probes one, so this is not that the calendar is wrong — it is that we have never looked.'
      : 'No calendar id is configured, so there is nothing to ask.',
    trap: 'A wrong id does not error. It returns 200 with no busy times, which looks exactly like a completely free calendar — so an empty answer would never have been evidence that the id was right.',
  }
}

export async function readSettings(clientId: string): Promise<Settings | null> {
  try {
    const db = admin()
    const [client, rows, automations] = await Promise.all([
      db.from('clients').select('id, name, whatsapp_number, whatsapp_sender_sid, timezone, locale').eq('id', clientId).single(),
      db.from('client_automations').select('automation_id, config').eq('client_id', clientId),
      readAutomations(clientId),
    ])
    if (client.error || rows.error) throw client.error ?? rows.error

    // The Concierge's config is the one with the keys the workflow reads.
    const config =
      (rows.data ?? [])
        .map((r) => r.config as Record<string, unknown> | null)
        .find((c) => c && Object.keys(c).length > 0) ?? null

    const wh = config?.working_hours
    const workingHours =
      wh && typeof wh === 'object' && 'start' in wh
        ? (wh as WorkingHours)
        : typeof wh === 'string'
          ? parseWorkingHours(wh)
          : null

    return {
      clientId,
      name: client.data.name,
      config,
      workingHours,
      /*
       * 🔒 FROZEN, WITH THE REASON. Neither of these is a rule we invented:
       * the number is how the Concierge routes an inbound message, so changing
       * it silently re-points somebody else's leads; the SID is checked by a
       * database constraint (`0021`) and is issued, not chosen.
       */
      frozen: [
        {
          label: 'WhatsApp number',
          value: client.data.whatsapp_number,
          why: 'The Concierge routes every inbound message by this number and picks one client for it. Changing it here would send this client’s leads somewhere else, so it is changed deliberately, with the workflow, and never from a form.',
        },
        {
          label: 'Sender SID',
          value: client.data.whatsapp_sender_sid ?? null,
          why: 'Issued by the provider, not chosen, and checked by a database constraint. A typo here fails at send time, which is the worst moment to find out.',
        },
      ],
      automations,
      calendar: calendarState(config),
      at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}
