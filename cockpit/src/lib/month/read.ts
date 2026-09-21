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
/** 0052: a client's own cost. Read when present; until 0052 is applied the read falls back (below). */
export const COST_CLIENT_COLUMNS = ['automation_client_id', 'web_client_id'] as const

export const MONTH_SOURCES = {
  contracts: { from: 'client_contracts_uncorrected', columns: CONTRACT_COLUMNS },
  automationClients: { from: 'clients', columns: AUTOMATION_CLIENT_COLUMNS },
  webClients: { from: 'web_clients', columns: WEB_CLIENT_COLUMNS },
  payments: { from: 'payments', columns: PAYMENT_COLUMNS },
  costs: { from: 'costs', columns: COST_COLUMNS },
} as const

type Source = keyof typeof MONTH_SOURCES
export type ReadFailure = { source: Source; message: string }

async function one<T>(key: Source, failures: ReadFailure[], extra: readonly string[] = []): Promise<T[] | null> {
  const src = MONTH_SOURCES[key]
  try {
    const { data, error } = await admin().from(src.from).select([...src.columns, ...extra].join(', '))
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

/**
 * Costs with the client reference when the database has it (0052), without it
 * when it does not. PostgreSQL answers an unknown column with 42703, and only
 * that falls back: any other failure is a failure. So the page is right on both
 * sides of the migration, and says which side it is on (clientCostsRecordable).
 */
async function costsRead(failures: ReadFailure[]): Promise<{ rows: CostRow[] | null; recordable: boolean }> {
  const src = MONTH_SOURCES.costs
  try {
    const { data, error } = await admin().from(src.from).select([...src.columns, ...COST_CLIENT_COLUMNS].join(', '))
    if (!error) return { rows: (data ?? []) as unknown as CostRow[], recordable: true }
    if (error.code !== '42703') {
      failures.push({ source: 'costs', message: `${src.from} read failed: ${error.message}` })
      return { rows: null, recordable: true }
    }
  } catch (e) {
    failures.push({ source: 'costs', message: `${src.from} read failed: ${(e as Error).message}` })
    return { rows: null, recordable: true }
  }
  return { rows: await one<CostRow>('costs', failures), recordable: false }
}

/**
 * The deploy gate's test clients: a client whose automation is marked
 * config.gate_only = true (set when the gate was built). Read by the marker,
 * never by name. A failed read is not fatal: those clients stay counted as
 * rehearsals, which is what they also are.
 */
async function testClientsRead(): Promise<string[] | null> {
  try {
    const { data, error } = await admin().from('client_automations').select('client_id').eq('config->>gate_only', 'true')
    return error ? null : [...new Set((data ?? []).map((r) => (r as { client_id: string }).client_id))]
  } catch {
    return null
  }
}

/** Every source at once; none waits for another, and none can take another down. */
export async function readMonthInputs(): Promise<{ inputs: MonthInputs; failures: ReadFailure[]; readAt: string }> {
  const failures: ReadFailure[] = []
  const [contracts, automationClients, webClients, payments, costs, testClientIds] = await Promise.all([
    one<ContractRow>('contracts', failures),
    one<AutomationClientRow>('automationClients', failures),
    one<WebClientRow>('webClients', failures),
    one<PaymentRow>('payments', failures),
    costsRead(failures),
    testClientsRead(),
  ])
  return {
    inputs: { contracts, automationClients, webClients, payments, costs: costs.rows, clientCostsRecordable: costs.recordable, testClientIds },
    failures,
    readAt: new Date().toISOString(),
  }
}
