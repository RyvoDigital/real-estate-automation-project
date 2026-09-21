import 'server-only'
import { admin } from '@/lib/supabase/admin'
import type { AutomationClientRow, ContractRow, CostRow, MonthInputs, PaymentRow, WebClientRow } from './model'

/*
 * The Month's reads. Brief I §2.11, "Reads — named columns, from the view, and
 * never three dead ones":
 *
 *   🔒 contracts come from client_contracts_uncorrected, NEVER the table: a
 *      superseded row still carries its period and fee, so summing the table
 *      counts every correction twice;
 *   🔒 named columns, never `*`, and never superseded_at, superseded_by or
 *      updated_at — all three are dead since 0050 and owed a drop, and a page
 *      that names its columns survives the drop.
 *
 * Each source is read on its own and returns null when THAT read fails, so a
 * failure reaches only its own panels (S4), never the whole page. The column
 * lists are exported so tests/month-reads.test.ts can hold them to the brief.
 */

export const CONTRACT_COLUMNS = [
  'id', 'automation_client_id', 'web_client_id', 'monthly_eur', 'setup_eur', 'setup_terms',
  'starts_on', 'ends_on', 'automations', 'signed_by', 'recorded_by', 'recorded_at', 'created_at', 'supersedes_id',
] as const
export const AUTOMATION_CLIENT_COLUMNS = ['id', 'name', 'status', 'rehearsal'] as const
export const WEB_CLIENT_COLUMNS = ['id', 'name', 'status', 'rehearsal', 'started_on', 'ended_on'] as const
// payments.received_on is gone (0044); settled_on is the only "the money arrived".
export const PAYMENT_COLUMNS = [
  'id', 'automation_client_id', 'web_client_id', 'kind', 'amount_eur', 'settled_on', 'settled_amount_eur', 'written_off_on',
] as const
export const COST_COLUMNS = ['id', 'label', 'category', 'side', 'amount_eur', 'cadence', 'started_on', 'ended_on'] as const

export const MONTH_SOURCES = {
  contracts: { from: 'client_contracts_uncorrected', columns: CONTRACT_COLUMNS },
  automationClients: { from: 'clients', columns: AUTOMATION_CLIENT_COLUMNS },
  webClients: { from: 'web_clients', columns: WEB_CLIENT_COLUMNS },
  payments: { from: 'payments', columns: PAYMENT_COLUMNS },
  costs: { from: 'costs', columns: COST_COLUMNS },
} as const

export type ReadFailure = { source: keyof MonthInputs; message: string }

async function one<T>(key: keyof MonthInputs, failures: ReadFailure[]): Promise<T[] | null> {
  const src = MONTH_SOURCES[key]
  try {
    const { data, error } = await admin().from(src.from).select(src.columns.join(', '))
    if (error) {
      failures.push({ source: key, message: `${src.from} read failed: ${error.message}` })
      return null
    }
    return (data ?? []) as T[]
  } catch (e) {
    failures.push({ source: key, message: `${src.from} read failed: ${(e as Error).message}` })
    return null
  }
}

/** Every source at once; none waits for another, and none can take another down. */
export async function readMonthInputs(): Promise<{ inputs: MonthInputs; failures: ReadFailure[]; readAt: string }> {
  const failures: ReadFailure[] = []
  const [contracts, automationClients, webClients, payments, costs] = await Promise.all([
    one<ContractRow>('contracts', failures),
    one<AutomationClientRow>('automationClients', failures),
    one<WebClientRow>('webClients', failures),
    one<PaymentRow>('payments', failures),
    one<CostRow>('costs', failures),
  ])
  return { inputs: { contracts, automationClients, webClients, payments, costs }, failures, readAt: new Date().toISOString() }
}
