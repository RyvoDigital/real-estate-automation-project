/*
 * DRY RUN for both reconciliation passes.
 *
 *   npx tsx tests/probe-reconcile.ts
 *
 * It READS. It prints the QUERY and the WINDOW alongside every result, and then
 * it stops.
 *
 * WHY THE QUERY IS PRINTED AND NOT ONLY THE RESULT
 * A zero from a pass that searched the wrong window looks exactly like a zero
 * from a clean night. §5c: a pass that cannot find its target reports success
 * identically to one with nothing to do. So every number below is printed next
 * to the question that produced it, and the totals are printed even when they
 * are zero — "0 pending of 0 rows" and "0 pending of 40 rows" are different
 * facts and must not print the same.
 *
 * It writes nothing: the store's write methods record and report instead.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  reconcilePending, sweepOrphans, templateMatcher, GRACE_MS,
  type PendingRow, type ReconcileStore, type ProviderReader,
} from '../src/lib/send/reconcile'
import { listMessages } from '../src/lib/send/provider-reader'
import { toChannelAddress } from '../src/lib/send/provider-address'
import { buildVocabulary } from '../src/lib/send/template'
import { loadVocabulary } from '../src/lib/send/template-record'
import type { ProviderMessage } from '../src/lib/send/match'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const line = (s = '') => console.log(s)
const mask = (v?: string) => (v ? `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} chars)` : 'MISSING')
const clip = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** Logs every provider query before making it, so a wrong window is visible. */
function loggingReader(): ProviderReader {
  return {
    async listMessages(p) {
      // The ACTUAL parameter values, after the channel prefix is applied. The
      // first version logged the arguments as passed, which stopped matching
      // what was sent the moment the prefix was introduced — a dry run whose
      // whole purpose is showing the query must show the query that was made.
      line(`    QUERY  GET /Messages.json`)
      line(`           From=${toChannelAddress(p.from)}${p.to ? `  To=${toChannelAddress(p.to)}` : '  To=(any)'}`)
      line(`           DateSent> ${p.sentAfter.toISOString()}`)
      line(`           DateSent< ${p.sentBefore.toISOString()}`)
      const span = (p.sentBefore.getTime() - p.sentAfter.getTime()) / 60000
      line(`           window   ${span.toFixed(0)} minutes`)
      const msgs = await listMessages(p)
      line(`           returned ${msgs.length} message(s)`)
      return msgs
    },
  }
}

async function main() {
  line('RECONCILIATION — DRY RUN. Nothing below has been written.')
  line('='.repeat(74))
  line(`account        ${mask(process.env.TWILIO_ACCOUNT_SID)}`)
  line(`read key sid   ${mask(process.env.TWILIO_READ_KEY_SID)}`)
  line(`read secret    ${mask(process.env.TWILIO_READ_KEY_SECRET)}`)
  line()

  // ---------------- PASS 1 ----------------
  const now = new Date()
  const cutoff = new Date(now.getTime() - GRACE_MS)

  const { data: all, error } = await db.from('sends').select('status')
  if (error) throw new Error(`sends read failed: ${error.message}`)
  const histogram = (all ?? []).reduce<Record<string, number>>((a, r) => {
    a[r.status as string] = (a[r.status as string] ?? 0) + 1; return a
  }, {})

  line('PASS 1 — complete `intended`')
  line('-'.repeat(74))
  line(`  now                ${now.toISOString()}`)
  line(`  grace              ${GRACE_MS / 60000} minutes`)
  line(`  cutoff             ${cutoff.toISOString()}`)
  line('  QUERY              sends where status in (intended, unresolved)')
  line(`                       and intent_recorded_at < ${cutoff.toISOString()}`)
  line(`  sends table        ${all?.length ?? 0} row(s) total ${JSON.stringify(histogram)}`)

  const writes: string[] = []
  const store: ReconcileStore = {
    async pending(olderThan) {
      const { data, error: e } = await db
        .from('sends')
        .select('id, client_id, phone_e164, body_intended, intent_recorded_at, status, clients(whatsapp_number)')
        .in('status', ['intended', 'unresolved'])
        .lt('intent_recorded_at', olderThan.toISOString())
        .order('intent_recorded_at')
      if (e) throw new Error(`pending read failed: ${e.message}`)
      return (data ?? []).map((r) => ({
        id: r.id as string,
        clientId: r.client_id as string,
        clientNumber: (r as unknown as { clients?: { whatsapp_number?: string } }).clients?.whatsapp_number ?? '',
        phoneE164: r.phone_e164 as string,
        bodyIntended: (r.body_intended as string) ?? null,
        intentRecordedAt: r.intent_recorded_at as string,
        status: r.status as PendingRow['status'],
      }))
    },
    async complete(id, patch) {
      writes.push(`    WOULD COMPLETE ${id}\n      ${JSON.stringify(patch, null, 2).split('\n').join('\n      ')}`)
    },
    async markUnresolved(id, patch) {
      writes.push(`    WOULD MARK UNRESOLVED ${id}\n      ${patch.last_error}`)
    },
  }

  const out = await reconcilePending({ store, reader: loggingReader(), now })
  line(`  pending            ${out.examined} row(s) matched that query`)
  if (out.examined === 0) {
    line()
    line(`  Zero pending out of ${all?.length ?? 0} rows in the table.`)
    line('  Those are different facts and this line exists to tell them apart:')
    line(`    · ${all?.length ?? 0} rows total means ${(all?.length ?? 0) === 0 ? 'the table is EMPTY — nothing has ever been dispatched,' : 'rows exist,'}`)
    line('      so a zero here says nothing about whether the query is right.')
    line('    · The query and cutoff above are what would have been asked.')
  }
  line(`  would complete     ${out.completed}`)
  line(`  would mark unres.  ${out.unresolved}`)
  line(`  alerts             ${out.alerts.length}`)
  for (const w of writes) line(w)
  for (const a of out.alerts) line(`    ALERT ${a.kind} on ${a.sendId}: ${a.detail}`)
  line()

  // ---------------- PASS 2 ----------------
  line('PASS 2 — orphan sweep')
  line('-'.repeat(74))
  const since = new Date(now.getTime() - 48 * 3600 * 1000)
  const { data: clients } = await db.from('clients').select('id, name, whatsapp_number')
  const { data: known } = await db.from('sends').select('provider_message_id')
  const knownIds = new Set((known ?? []).map((r) => r.provider_message_id).filter(Boolean) as string[])

  line(`  window             ${since.toISOString()}  →  ${now.toISOString()}  (48h)`)
  line(`  known provider ids ${knownIds.size}`)
  line()

  for (const c of clients ?? []) {
    line(`  ${c.name}  ${c.whatsapp_number}`)
    if (!c.whatsapp_number) { line('    no number configured — skipped'); continue }
    try {
      // The vocabulary is per client and unfiltered by status (§4e).
      const templates = await loadVocabulary(c.id as string)
      const vocab = buildVocabulary(templates)
      line(`    vocabulary ${templates.length} recorded, ${vocab.usable} usable, ${vocab.refused.length} refused`)
      if (vocab.usable === 0) {
        line('    ⚠ AN EMPTY VOCABULARY MATCHES NOTHING, so this sweep cannot report an')
        line('      orphan however many messages it examines. Not a clean result — a')
        line('      property of having recorded no templates for this client.')
      }
      for (const r of vocab.refused) {
        if (!r.ok) line(`    ⚠ refused from the vocabulary: ${r.detail}`)
      }
      const sweep = await sweepOrphans({
        clientId: c.id as string,
        clientNumber: c.whatsapp_number as string,
        reader: loggingReader(),
        knownProviderIds: knownIds,
        looksLikeTemplate: templateMatcher(vocab),
        since, until: now,
      })
      line(`    examined ${sweep.examined}, orphans ${sweep.orphans.length}, halt=${sweep.halt}`)
      line(`    ${sweep.detail}`)
      if (sweep.examined === 0) {
        line('    ⚠ ZERO MESSAGES EXAMINED. For a client whose Concierge is live this is')
        line('      not a clean sweep — it is a number that sent nothing in 48 hours, a')
        line('      number not on this account, or a filter that does not match. The')
        line('      sweep cannot tell those apart and does not pretend to.')
      }
      for (const o of sweep.orphans) {
        line(`      ORPHAN ${o.sid}  ${o.dateSent}  to ${o.to}  "${clip(o.body)}"`)
      }
    } catch (e) {
      line(`    QUERY FAILED: ${e instanceof Error ? e.message : String(e)}`)
      line('    A failure here is NOT an empty result and must never be read as one.')
    }
    line()
  }

  line('='.repeat(74))
  line('Nothing was written. Message bodies are truncated; only orphan candidates')
  line('are shown at all.')
}

main().catch((e) => { console.error(e); process.exit(1) })
