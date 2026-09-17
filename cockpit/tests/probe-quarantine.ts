/*
 * DRY RUN for the quarantine pass — docs/consent-ledger-design.md §5.
 *
 *   npx tsx tests/probe-quarantine.ts
 *
 * It READS. It prints, in full, every consent_events row it would write and
 * every leads update it would make, and then it stops. There is no flag on this
 * file that makes it write; the pass that writes is a separate file, and it
 * takes the count this one prints as a precondition (§5c rule 2).
 *
 * WHY THE POPULATION IS FOUND ON `leads` ALONE
 * The first version of this targeted "leads joined to COMMITTED import
 * batches". Against the real database that returns nothing, while the false
 * record plainly exists — the batch was reverted 106 seconds after it
 * committed, and revert.ts retains any lead that has since acquired a message.
 * A pass keyed on committed batches would have corrected nothing and reported
 * success, indistinguishable from a clean database. Engineering lesson §5c:
 * target the object that carries the defect, not the object that explains it.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { QUARANTINE_NOTE } from './lib/quarantine-note'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
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
  full_name: string | null
  consent_status: string | null
  consent_at: string | null
  created_at: string
  qualification: { imported?: { batch_id?: string; line?: number } } | null
}

type BatchRow = {
  id: string
  filename: string
  status: string
  committed_at: string | null
  reverted_at: string | null
}

const line = (s = '') => console.log(s)

async function main() {
  // The population, on `leads` alone.
  const { data, error } = await db
    .from('leads')
    .select('id, client_id, phone, full_name, consent_status, consent_at, created_at, qualification')
    .in('consent_status', ['opt_in', 'opt_out'])
    .order('created_at')
  if (error) throw new Error(`population read failed: ${error.message}`)
  const leads = (data ?? []) as Lead[]

  // Context, so that a zero is a fact rather than a shrug (§5b).
  const { count: total } = await db.from('leads').select('id', { count: 'exact', head: true })

  line('QUARANTINE — DRY RUN. Nothing below has been written.')
  line('='.repeat(72))
  line(`leads carrying a consent state : ${leads.length}`)
  line(`leads in the database          : ${total ?? '?'}`)
  line()

  if (leads.length === 0) {
    line('Zero rows to quarantine.')
    line('That is EITHER a clean database OR a targeting bug, and this script')
    line('cannot tell you which. The query was:')
    line("  leads where consent_status in ('opt_in','opt_out')")
    line('If the lead count above is also 0 the database is empty and the zero')
    line('means nothing at all. Do not run the writing pass on this result.')
    return
  }

  for (const l of leads) {
    // Batch metadata is ENRICHMENT. Absent without complaint: the batch may be
    // reverted, deleted or superseded, and none of that changes the defect.
    const batchId = l.qualification?.imported?.batch_id ?? null
    let batch: BatchRow | null = null
    if (batchId) {
      const { data: b } = await db
        .from('import_batches')
        .select('id, filename, status, committed_at, reverted_at')
        .eq('id', batchId)
        .maybeSingle()
      batch = (b as BatchRow | null) ?? null
    }

    const event = {
      client_id: l.client_id,
      phone_e164: l.phone,
      lead_id: l.id,
      kind: 'quarantined',
      // The only true thing consent_at ever said: when the claim entered the
      // system. It moves to the clock it always belonged to.
      recorded_at: l.consent_at,
      // Unknown, and §3.2 forbids substituting the plausible value.
      occurred_at: null,
      segment: null,
      source: 'import_declaration',
      // NOT RETAINED: import_batches.staged is cleared on commit, so the cell
      // that was read as consent is gone. Never invented.
      wording: null,
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
      jurisdiction: l.phone?.startsWith('+351') ? 'PT' : l.phone?.startsWith('+34') ? 'ES' : null,
      // Named plainly, and in the active voice, because someone will read this
      // years from now with no context and a record that distances from its own
      // cause reads worse under scrutiny than one that states it.
      note: QUARANTINE_NOTE,
    }

    line(`LEAD ${l.id}`)
    line(`  ${l.full_name ?? '(no name)'} · ${l.phone ?? '(no phone)'}`)
    line(`  consent_status=${l.consent_status}  consent_at=${l.consent_at}`)
    if (batch) {
      line(`  batch ${batch.filename} · ${batch.status} · committed ${batch.committed_at} · reverted ${batch.reverted_at}`)
    } else if (batchId) {
      line(`  batch ${batchId} — NO LONGER PRESENT (enrichment absent, defect unaffected)`)
    } else {
      line('  no batch recorded on this lead')
    }
    line()
    line('  WOULD INSERT into consent_events:')
    line(JSON.stringify(event, null, 2).split('\n').map((s) => '    ' + s).join('\n'))
    line()
    line('  THEN, and only after that insert succeeds, WOULD UPDATE leads:')
    line(`    set consent_status = 'unknown', consent_at = null  where id = '${l.id}'`)
    line()
    line('-'.repeat(72))
  }

  line()
  line('Nothing was written. To run the pass for real, its precondition is')
  line(`EXPECT_ROWS=${leads.length} — a different count means the world changed`)
  line('since this dry run and the pass must stop rather than improvise.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
