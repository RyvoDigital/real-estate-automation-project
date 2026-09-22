/**
 * Creating a client: the WRITE path of /onboarding, with every dependency
 * injected. Brief §2.8; the rebuild's first checkpoint (22 Sep 2026).
 *
 * PURE: no React, no `server-only`, no database of its own. lib/actions.ts's
 * createClient is the thin server action that supplies the real ones, and
 * tests/onboarding-create.test.ts drives every path with fakes. It writes
 * clients.rehearsal, the column The Month and every business figure trust, so
 * "every write path gets a test" (operator, 22 Sep) is this file's contract.
 *
 *   🔒 Nothing is kept half-made. The client row holds the WhatsApp number, and
 *      0007 makes that number unique, so a client whose config failed used to
 *      stay behind and refuse the retry as "already uses this number". The two
 *      inserts are now ONE transaction (0053, create_client_with_config): a
 *      failure anywhere inside it keeps neither row. There is no delete path,
 *      on purpose (operator, 22 Sep 2026): no application code deletes a client
 *      (0049), and a client delete cascades through 19 tables.
 *   🔒 "The calendar check could not run" is not "the calendar is wrong" (brief
 *      §2.8, S4). Only an answer from Google about THIS calendar is a field
 *      error; a check that never reached it is not the operator's mistake.
 *   🔒 The rehearsal answer is re-parsed here, never defaulted (0037/0038).
 *   🔒 The duplicate check is advisory; 0007's unique index is the arbiter, so a
 *      unique violation on insert is the same refusal, not a generic failure.
 */

import { toConfig, validate, type ClientDraft, type FieldError } from './onboarding'
import { parseRehearsal, rehearsalToColumn, REHEARSAL_UNANSWERED } from './rehearsal'

export type CalendarProbe = { ok: boolean; error: string | null; busyCount: number | null }

export type CreateResult =
  | { ok: true; clientId: string; message: string; eventFailed: boolean }
  | { ok: false; errors: FieldError[]; message: string; kind: 'invalid' | 'probe_could_not_run' | 'calendar_wrong' | 'duplicate' | 'write_failed'; leftBehind: string | null }

type DbError = { code?: string; message: string }

export type CreateDeps = {
  probeCalendar(calendarId: string, timezone: string): Promise<CalendarProbe>
  findClientByNumber(whatsappNumber: string): Promise<{ id: string; name: string } | null>
  /** 0053's create_client_with_config: the client and its config, or neither. */
  createAtomically(client: Record<string, unknown>, automationKey: string, config: Record<string, unknown>): Promise<{ id: string | null; error: DbError | null }>
  readConfig(clientId: string): Promise<{ config: unknown } | null>
  insertEvent(row: Record<string, unknown>): Promise<{ error: DbError | null }>
  revalidate(path: string): void
}

/**
 * Which probe failures are an answer about the calendar itself. The validate
 * workflow (workflows/ryvoCockpitValidate01.json) reports Google's per-calendar
 * errors as calendar_error:<reason>, a calendar missing from the response, or
 * google_http_<status>. Everything else (not configured, unauthorised,
 * unreachable, Google 5xx or a credential 401/403, or an error we do not
 * recognise) means the check never got an answer about this calendar.
 */
export function probeVerdict(p: CalendarProbe): 'confirmed' | 'calendar_wrong' | 'could_not_run' {
  if (p.ok) return 'confirmed'
  const e = p.error ?? ''
  if (/^calendar_error:/.test(e) || e === 'calendar_absent_from_response' || /^google_http_404\b/.test(e)) return 'calendar_wrong'
  return 'could_not_run'
}

const normaliseNumber = (v: string) => v.replace(/[\s()-]/g, '')

export async function createClientCore(draft: ClientDraft, deps: CreateDeps): Promise<CreateResult> {
  const fail = (kind: Extract<CreateResult, { ok: false }>['kind'], message: string, errors: FieldError[] = [], leftBehind: string | null = null): CreateResult =>
    ({ ok: false, kind, message, errors, leftBehind })

  const errors = validate(draft)
  if (errors.length) return fail('invalid', `${errors.length} field(s) need fixing.`, errors)

  // Re-parsed, never trusted from validate() and never defaulted: a nullish
  // fallback to the real-agency value here would record "a real agency" for a
  // draft nobody classified (tests/rehearsal.test.ts refuses one beside this line).
  const answer = parseRehearsal(draft.rehearsal)
  if (answer === null) return fail('invalid', REHEARSAL_UNANSWERED, [{ field: 'rehearsal', message: REHEARSAL_UNANSWERED }])

  const probe = await deps.probeCalendar(draft.calendarId, draft.timezone)
  const verdict = probeVerdict(probe)
  if (verdict === 'could_not_run') {
    return fail('probe_could_not_run',
      `The calendar check could not run (${probe.error ?? 'no reason given'}), so nothing was saved. ` +
      'This says nothing about the calendar itself: try again, and if it persists, the check is what needs fixing.')
  }
  if (verdict === 'calendar_wrong') {
    return fail('calendar_wrong', 'The calendar could not be confirmed, so nothing was saved.', [{
      field: 'calendarId',
      message: `Google answered about this calendar and did not confirm it (${probe.error}). Saving it would make every slot in the window look available.`,
    }])
  }

  const wa = normaliseNumber(draft.whatsappNumber)
  const duplicate = (name: string | null) => fail('duplicate', 'That WhatsApp number is already in use, so nothing was saved.', [{
    field: 'whatsappNumber',
    message: `${name ?? 'Another client'} already uses this number. The Concierge routes inbound messages by it and picks one client arbitrarily, so sharing it would send that client's leads to this one.`,
  }])
  const clash = await deps.findClientByNumber(wa)
  if (clash) return duplicate(clash.name)

  const name = draft.agencyName.trim()
  const created = await deps.createAtomically({
    name, agency_name: name, whatsapp_number: wa,
    timezone: draft.timezone.trim(), locale: draft.locale.trim(), status: 'active',
    rehearsal: rehearsalToColumn(answer),
  }, 'inbound_concierge', toConfig(draft) as Record<string, unknown>)
  if (created.error?.code === '23505') return duplicate(null)        // 0007 arbitrated a race
  if (created.error?.code === 'P0002') {
    return fail('write_failed', 'The inbound_concierge automation is missing from the catalogue, so nothing was created. Fix the catalogue before onboarding anyone.')
  }
  if (created.error || !created.id) {
    return fail('write_failed', `Could not create the client: ${created.error?.message ?? 'no id returned'}. Nothing was saved: the client and its config are one transaction.`)
  }
  const clientId = created.id

  // A green call is not evidence the rows exist (rule 14). Both were created in one
  // transaction, so a config that does not read back is a READ problem to check,
  // never a reason to delete anything.
  const check = await deps.readConfig(clientId)
  if (!check?.config) {
    return fail('write_failed',
      `The client was created (${clientId}), but its config did not read back. Nothing was deleted: check client_automations for this client before trying again.`,
      [], clientId)
  }

  const ev = await deps.insertEvent({
    client_id: clientId, type: 'client.created', severity: 'info',
    summary: `${name} onboarded from the cockpit`,
    data: { source: 'cockpit', calendar_busy_intervals: probe.busyCount, rehearsal: rehearsalToColumn(answer) },
  })

  deps.revalidate('/leads')
  deps.revalidate('/onboarding')
  return {
    ok: true, clientId, eventFailed: Boolean(ev.error),
    message: `${name} created as ${answer === 'rehearsal' ? 'a rehearsal' : 'a real agency'}, with a calendar that answered free/busy.` +
      (ev.error ? ` The audit event did not write (${ev.error.message}).` : ''),
  }
}
