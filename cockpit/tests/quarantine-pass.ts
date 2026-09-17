/*
 * THE WRITING PASS — docs/consent-ledger-design.md §5. Run once.
 *
 *   npx tsx tests/probe-quarantine.ts          # read this first, and read it all
 *   EXPECT_ROWS=1 npx tsx tests/quarantine-pass.ts
 *
 * It writes one `quarantined` row per affected contact and then clears the two
 * false columns on that lead. It refuses to run without EXPECT_ROWS, and it
 * refuses to run if the population it finds is not the population you approved.
 *
 * WHY THE PRECONDITION IS MANDATORY AND NOT A CONVENIENCE (§5c)
 * A remediation pass is run once, by someone who has already decided the problem
 * is real, and its success is measured by there being nothing left to see. So
 * "corrected 0 rows, failed 0 rows, exited clean" is BOTH the output of a
 * perfect run and the output of a pass that could not find its target. The two
 * are indistinguishable afterwards and nobody looks again. The count from the
 * dry run is what tells them apart, so it is an argument, not a default.
 *
 * ORDER, AND IT MATTERS (§3.10, persist-then-send)
 * The ledger row is written FIRST and the columns are cleared only after it has
 * succeeded. A crash between the two leaves a database with the evidence and
 * the old value -- recoverable, and obvious. The other order leaves a cleared
 * column and no record of what it held, which is unrecoverable.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { QUARANTINE_NOTE } from './lib/quarantine-note'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const expected = Number(process.env.EXPECT_ROWS)
if (!Number.isInteger(expected) || expected < 0) {
  console.error(
    'EXPECT_ROWS is required and must be a whole number.\n' +
    'Run `npx tsx tests/probe-quarantine.ts` first and pass the count it prints.\n' +
    'A pass that decides for itself how much to change is not a remediation, it is an edit.',
  )
  process.exit(2)
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type Lead = {
  id: string
  client_id: string
  phone: string | null
  consent_status: string | null
  consent_at: string | null
  qualification: { imported?: { batch_id?: string; line?: number } } | null
}

function jurisdictionOf(phone: string | null): string | null {
  if (phone?.startsWith('+351')) return 'PT'
  if (phone?.startsWith('+34')) return 'ES'
  return null   // resolved properly by the jurisdiction engine; null is a refusal, not a guess
}

async function main() {
  const { data, error } = await db
    .from('leads')
    .select('id, client_id, phone, consent_status, consent_at, qualification')
    .in('consent_status', ['opt_in', 'opt_out'])
    .order('created_at')
  if (error) throw new Error(`population read failed: ${error.message}`)
  const leads = (data ?? []) as Lead[]

  if (leads.length !== expected) {
    console.error(
      `STOPPED. Expected ${expected} rows, found ${leads.length}.\n` +
      'The world changed since the dry run was approved. Re-run the dry run, read\n' +
      'what it now says, and approve that instead. This pass does not improvise.',
    )
    process.exit(1)
  }

  console.log(`Quarantining ${leads.length} row(s). Ledger first, columns second.`)
  let done = 0

  for (const l of leads) {
    if (!l.phone) {
      console.error(`STOPPED at lead ${l.id}: no phone, and the ledger is keyed on the phone.`)
      process.exit(1)
    }
    const batchId = l.qualification?.imported?.batch_id ?? null
    let batch: { filename: string; status: string; committed_at: string | null; reverted_at: string | null } | null = null
    if (batchId) {
      const { data: b } = await db
        .from('import_batches')
        .select('filename, status, committed_at, reverted_at')
        .eq('id', batchId)
        .maybeSingle()
      batch = (b as { filename: string; status: string; committed_at: string | null; reverted_at: string | null } | null) ?? null
    }

    // 1. THE LEDGER ROW. If this fails, nothing else happens to this lead.
    const { data: written, error: insErr } = await db
      .from('consent_events')
      .insert({
        client_id: l.client_id,
        phone_e164: l.phone,
        lead_id: l.id,
        kind: 'quarantined',
        recorded_at: l.consent_at,     // the only true thing that field ever said
        occurred_at: null,             // unknown, and never substituted (§3.2)
        segment: null,
        source: 'import_declaration',
        wording: null,                 // NOT RETAINED -- staged rows are cleared on commit
        evidence: {
          batch_id: batchId,
          line: l.qualification?.imported?.line ?? null,
          batch_status: batch?.status ?? 'batch no longer present',
          batch_filename: batch?.filename ?? null,
          batch_committed_at: batch?.committed_at ?? null,
          batch_reverted_at: batch?.reverted_at ?? null,
          prior_consent_status: l.consent_status,
          prior_consent_at: l.consent_at,
        },
        declared_by: null,
        jurisdiction: jurisdictionOf(l.phone),
        note: QUARANTINE_NOTE,
      })
      .select('id')
      .single()
    if (insErr) {
      console.error(`STOPPED at lead ${l.id}: ledger insert failed — ${insErr.message}`)
      console.error('Nothing was cleared on this lead. The false value is still there, which is')
      console.error('the correct state to fail into: recoverable, and visible.')
      process.exit(1)
    }

    // 2. ONLY NOW the columns.
    const { error: updErr } = await db
      .from('leads')
      .update({ consent_status: 'unknown', consent_at: null })
      .eq('id', l.id)
    if (updErr) {
      console.error(`STOPPED at lead ${l.id}: ledger row ${written!.id} was written but the lead`)
      console.error(`could not be cleared — ${updErr.message}`)
      console.error('Recover by clearing it by hand. Do NOT delete the ledger row: it is now the')
      console.error('record of what the column held, and consent_events refuses deletion anyway.')
      process.exit(1)
    }

    done += 1
    console.log(`  ${l.id} → consent_events ${written!.id}`)
  }

  console.log(`Done. ${done} of ${expected} quarantined.`)
  console.log('Re-run the dry run: it should now report 0, and that 0 has been earned.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
