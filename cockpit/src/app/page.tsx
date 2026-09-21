import { requireOperator } from '@/lib/auth'
import { readCounts } from '@/lib/counts'
import { Frame } from '@/components/Frame'
import { TheMonth } from '@/components/month/TheMonth'
import { Entry, type ContractOption, type PartyOption } from '@/components/month/Entry'
import { buildMonth, eur, cents, lisbonToday, monthKey, monthOf, type Month } from '@/lib/month/model'
import { readMonthInputs } from '@/lib/month/read'
import styles from '@/components/month/month.module.css'

/*
 * The landing is The Month (D2′). Brief I §2.10–2.11, design v3.
 *
 * The page authenticates, reads each source on its own (lib/month/read.ts),
 * builds the model from today's LISBON date (lib/month/model.ts) and renders
 * it. It decides nothing itself: every rule is in the model and tested there.
 *
 * ?m=YYYY-MM picks a month; anything else, or nothing, is the current month.
 * A month in the future is shown as not started rather than refused, and the
 * stepper stops at the month in progress.
 *
 * The phone is refused (brief §1.13, design v3): The Month sets two businesses
 * side by side and needs a desk. Today works on the phone.
 */
export const dynamic = 'force-dynamic'

function monthFrom(q: string | string[] | undefined, today: string): Month {
  const v = Array.isArray(q) ? q[0] : q
  if (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return monthOf(`${v}-01`)
  return monthOf(today)
}

export default async function Landing({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const operator = await requireOperator()
  const [counts, read, q] = await Promise.all([readCounts(), readMonthInputs(), searchParams])
  const today = lisbonToday(new Date())
  const month = monthFrom(q.m, today)
  const model = buildMonth(read.inputs, month, today)

  // What the forms offer: every client (a rehearsal is marked, never hidden),
  // and the contracts in force, which a correction or an end supersedes.
  const names = new Map<string, string>()
  const parties: PartyOption[] = [
    ...(read.inputs.webClients ?? []).map((c) => ({ value: `w:${c.id}`, label: c.name, business: 'web' as const, rehearsal: c.rehearsal })),
    ...(read.inputs.automationClients ?? []).map((c) => ({ value: `a:${c.id}`, label: c.name, business: 'automation' as const, rehearsal: c.rehearsal })),
  ]
  for (const p of parties) names.set(p.value.slice(2), p.label)
  const contracts: ContractOption[] = (read.inputs.contracts ?? []).map((c) => ({
    id: c.id,
    label: `${names.get(c.automation_client_id ?? c.web_client_id ?? '') ?? 'a client'} · ${eur(cents(c.monthly_eur) ?? 0)} from ${c.starts_on}${c.ends_on ? ` to ${c.ends_on}` : ''}`,
  }))

  return (
    <Frame mode="operator" current="month" counts={counts} operatorEmail={operator.email}>
      <div className={styles.desk}>
        <TheMonth model={model} readAt={read.readAt} failures={read.failures} hrefFor={(m) => `/?m=${monthKey(m)}`} />
        <Entry parties={parties} contracts={contracts} recordable={read.inputs.clientCostsRecordable !== false} />
      </div>
      <div className={styles.refuse}>
        <h2>The Month needs a desk.</h2>
        <p>It sets two businesses, their clients and their costs side by side. What needs you right now is on Today, and it works here.</p>
        <a href="/today" className={styles.refuseLink}>Open Today</a>
      </div>
    </Frame>
  )
}
