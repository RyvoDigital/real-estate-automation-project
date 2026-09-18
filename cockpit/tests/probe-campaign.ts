/*
 * DRY RUN of a campaign, end to end, against production.
 *
 *   npm run probe:campaign
 *
 * It READS. It prints the queries, the vocabulary, the forecast and — above all
 * — WHY a zero is a zero. A campaign that forecasts nothing contactable must say
 * which of the several possible reasons it was, because "0 contactable" from a
 * missing policy row, a missing consent ledger and an empty lead list all look
 * identical and need completely different afternoons.
 *
 * IT CANNOT SEND, BY CONSTRUCTION RATHER THAN BY CARE: it imports campaign-plan,
 * which imports no adapter, no dispatcher and no permit. There is no flag here
 * that makes it write.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { planCampaign } from '../src/lib/send/campaign-plan'
import { loadVocabulary } from '../src/lib/send/template-record'
import { buildVocabulary } from '../src/lib/send/template'
import { lateRefusalLimit } from '../src/lib/send/runner'
import { DAILY_CAP } from '../src/lib/send/pacing'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
const line = (s = '') => console.log(s)

async function main() {
  line('CAMPAIGN — DRY RUN. Nothing below has been written and nothing can be sent.')
  line('='.repeat(76))

  const { data: clients } = await db.from('clients').select('id, name, whatsapp_number').order('name')
  line(`clients: ${clients?.length ?? 0}`)
  line()

  for (const c of clients ?? []) {
    line(`${'━'.repeat(76)}`)
    line(`${c.name}   ${c.whatsapp_number ?? '(no number)'}`)
    line(`${'━'.repeat(76)}`)

    const plan = await planCampaign(c.id as string)
    const d = plan.diagnostics
    const e = plan.evaluation

    line('PHASE 1 — what was read')
    line(`  QUERY  leads where client_id = ${c.id}`)
    line(`         → ${d.contactsFound} lead(s), ${d.contactsWithPhone} with a phone`)
    line(`  QUERY  consent_by_contact where client_id = … and phone_e164 in (${d.contactsWithPhone} phones)`)
    line(`         → ${d.consentRowsFound} contact(s) have anything recorded about them`)
    line(`  QUERY  jurisdiction_policy where country in (${d.countriesSeen.join(', ') || '—'})`)
    line(`         → found ${d.policiesFound.join(', ') || 'none'}; CONFIRMED ${d.policiesConfirmed.join(', ') || 'none'}`)
    line(`  QUERY  sends where status = 'refused' → ${d.terminalAlready} contact(s) already terminal`)
    line(`  QUERY  message_templates where client_id = … → ${d.templatesRecorded} recorded`)
    line()

    const templates = await loadVocabulary(c.id as string)
    const vocab = buildVocabulary(templates)
    line('  VOCABULARY (for the orphan sweep, unfiltered by status)')
    line(`         ${templates.length} recorded, ${vocab.usable} usable, ${vocab.refused.length} refused`)
    for (const r of vocab.refused) if (!r.ok) line(`         ⚠ ${r.detail}`)
    line()

    line('PHASE 1 — the forecast')
    line(`  evaluated    ${e.targetCount}`)
    line(`  contactable  ${e.forecastPermitted}`)
    line(`  refused      ${e.forecastRefused}  ${JSON.stringify(e.refusalBreakdown)}`)
    line(`  excluded     ${e.excludedCount}  ${JSON.stringify(e.excludedBreakdown)}`)
    line(`  adds up      ${e.targetCount === e.excludedCount + e.forecastPermitted + e.forecastRefused}`)
    line()

    if (e.forecastPermitted === 0) {
      line('  WHY IT IS ZERO — and these are different afternoons:')
      for (const n of d.notes) line(`    · ${n}`)
      if (d.notes.length === 0) {
        line('    · No structural reason found. The refusal breakdown above is the answer,')
        line('      and every contact was refused for a reason specific to them.')
      }
      line()
    }

    line('PHASE 2 — what WOULD happen, and does not')
    line(`  walk order   most recently engaged first, ${plan.walk.length} contact(s)`)
    for (const w of plan.walk.slice(0, 5)) {
      line(`               ${w.phone}  last contact ${w.lastContactAt ?? '(never)'}`)
    }
    if (plan.walk.length > 5) line(`               … and ${plan.walk.length - 5} more`)
    line(`  daily cap    ${DAILY_CAP}`)
    line(`  late-refusal halt at more than ${lateRefusalLimit(e.forecastPermitted)} of ${e.forecastPermitted}`)
    line()

    line('  COULD IT SEND? checked, not assumed:')
    const blockers: string[] = []
    if (!c.whatsapp_number) blockers.push('the client has no WhatsApp number')
    if (d.policiesConfirmed.length === 0) blockers.push('no jurisdiction is confirmed by a named lawyer')
    if (d.templatesRecorded === 0) blockers.push('no approved template is recorded')
    if (e.forecastPermitted === 0) blockers.push('no contact has a basis in the ledger')
    if (!process.env.TWILIO_SEND_KEY_SID) blockers.push('the SENDING credential is not configured in this environment')
    const { data: senderCol } = await db.from('clients').select('*').eq('id', c.id).maybeSingle()
    if (senderCol && !('whatsapp_sender_sid' in senderCol)) {
      blockers.push('no column holds the Sender SID, so the quality rating cannot be read at all')
    }
    for (const b of blockers) line(`    ✗ ${b}`)
    line(`    ${blockers.length} blocker(s). A send requires ALL of them cleared.`)
    line()
  }

  line('='.repeat(76))
  line('Nothing was written. This probe imports campaign-plan.ts, which imports no')
  line('adapter, no dispatcher and no permit — it could not send if it tried.')
}

main().catch((e) => { console.error(e); process.exit(1) })
