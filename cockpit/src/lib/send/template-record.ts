import 'server-only'

import { admin } from '@/lib/supabase/admin'
import { variablesAreContiguous, variablesIn, type Template } from '@/lib/send/template'

/**
 * Recording what Meta approved, and loading the vocabulary the sweep reads.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ RECORDING AN APPROVAL IS NOT A SEND, AND THIS FILE HAS NO ROUTE TO ONE. │
 * │ It writes one table and reads one table. It names no recipient, holds   │
 * │ no provider credential, and imports neither the dispatcher nor the      │
 * │ permit — the table answers what may be said, never to whom (0020).      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHY RECORDING IS AN OPERATOR ACTION RATHER THAN A SYNC, FOR NOW
 * Twilio's Content API could be polled for approvals, and eventually should be.
 * Today it would need a third resource on the read key, and there is nothing to
 * sync: no template has been submitted. Recording by hand, once per approved
 * version, is not a burden — and it puts a person between Meta's approval and
 * our record, which is the right place for one while the first template is
 * being learned.
 *
 * THE RISK THAT CARRIES, STATED: a mistyped approval id is accepted here and
 * refused by Twilio at send time, as a terminal 4xx with the provider's own
 * error. That is a loud failure on the first send rather than a silent one, but
 * it is a failure in production rather than at recording — which is why the
 * shape is validated below, and why the Content API sync is worth building
 * before the first client rather than after.
 */

/** Twilio Content SIDs: HX followed by 32 hex characters. */
const APPROVAL_ID = /^HX[0-9a-f]{32}$/i

export type RecordInput = {
  clientId: string
  name: string
  language: string
  body: string
  category: 'marketing' | 'utility' | 'authentication'
  approvalId: string
  submittedAt?: string
  sourceDocument?: string
}

export type RecordResult =
  | { ok: true; id: string; version: number }
  | { ok: false; reason: string }

export async function recordApprovedTemplate(input: RecordInput): Promise<RecordResult> {
  // Validate before touching the database, so the refusal names the problem
  // rather than surfacing a constraint violation.
  const problem = validate(input)
  if (problem) return { ok: false, reason: problem }

  const db = admin()

  // The next version for this name+language. Read-then-write, and the unique
  // constraint on (client_id, name, language, version) is what makes a race
  // fail loudly rather than produce two v3s.
  const { data: existing, error: readErr } = await db
    .from('message_templates')
    .select('version')
    .eq('client_id', input.clientId)
    .eq('name', input.name)
    .eq('language', input.language)
    .order('version', { ascending: false })
    .limit(1)
  if (readErr) return { ok: false, reason: `could not read existing versions: ${readErr.message}` }

  const version = ((existing?.[0]?.version as number | undefined) ?? 0) + 1

  const { data, error } = await db
    .from('message_templates')
    .insert({
      client_id: input.clientId,
      name: input.name,
      language: input.language,
      version,
      body: input.body,
      category: input.category,
      approval_id: input.approvalId,
      status: 'approved',
      submitted_at: input.submittedAt ?? null,
      approved_at: new Date().toISOString(),
      source_document: input.sourceDocument ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // The unique constraints do real work here: the same approval id recorded
    // twice, or two people recording v3 at once.
    return { ok: false, reason: `the database refused the row: ${error.message}` }
  }
  return { ok: true, id: data!.id as string, version }
}

/** Pure, so every refusal below is a test with no database. */
export function validate(input: RecordInput): string | null {
  if (!input.body.trim()) return 'the body is empty'
  if (!APPROVAL_ID.test(input.approvalId)) {
    return (
      `"${input.approvalId}" is not a Twilio Content SID (HX followed by 32 hex characters). ` +
      'A mistyped id is accepted by this table and refused by Twilio on the first send, so it is ' +
      'checked here rather than discovered in production.'
    )
  }
  if (!variablesAreContiguous(input.body)) {
    return (
      `the body uses variables ${JSON.stringify(variablesIn(input.body))}, which are not contiguous ` +
      'from 1. Meta rejects non-contiguous numbering, and finding that out at submission costs a ' +
      'day of round trip.'
    )
  }
  if (!/^[a-z]{2}_[A-Z]{2}$/.test(input.language)) {
    return `"${input.language}" is not a language tag of the shape pt_PT`
  }
  return null
}

/**
 * Every recorded template for a client, REGARDLESS OF STATUS.
 *
 * The select does not mention status, and the type it returns has no status
 * field, so there is nothing downstream to filter on. A message sent under a
 * template Meta disabled yesterday is still one of ours: filtering here would
 * make every orphan under it invisible, on the check whose only job is seeing
 * them (engineering-lessons §4e).
 */
export async function loadVocabulary(clientId: string): Promise<Template[]> {
  const { data, error } = await admin()
    .from('message_templates')
    .select('approval_id, client_id, name, language, version, body')
    .eq('client_id', clientId)
  if (error) throw new Error(`loadVocabulary: ${error.message}`)

  return (data ?? [])
    .filter((r) => r.approval_id)
    .map((r) => ({
      approvalId: r.approval_id as string,
      clientId: r.client_id as string,
      name: r.name as string,
      language: r.language as string,
      version: r.version as number,
      body: r.body as string,
    }))
}
