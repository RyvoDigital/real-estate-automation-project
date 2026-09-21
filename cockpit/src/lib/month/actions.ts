'use server'

import { revalidatePath } from 'next/cache'
import { requireOperator } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { save, type EntryKind, type EntryResult } from './entry'

/*
 * The Month's three server actions. Thin by design: the operator check, the
 * real database and the real revalidation around lib/month/entry.ts's save,
 * where every rule lives and is tested with fakes.
 *
 * revalidatePath('/') runs inside the action after a successful insert, so Next
 * re-renders The Month in the SAME response (Next's server-actions guide, "A
 * single response carries data and UI"): the page is current with no reload.
 *
 * Whether a single client's cost can be recorded is asked of the DATABASE
 * (does 0052's column exist?), never taken from the form.
 */

async function clientCostsRecordable(): Promise<boolean> {
  const { error } = await admin().from('costs').select('automation_client_id').limit(0)
  return !error || error.code !== '42703'
}

async function run(kind: EntryKind, form: FormData): Promise<EntryResult> {
  const operator = await requireOperator()
  return save(kind, form, operator.email, {
    insert: async (table, row) => {
      const { error } = await admin().from(table).insert(row)
      return { error: error ? { message: error.message } : null }
    },
    revalidate: (path) => revalidatePath(path),
    clientCostsRecordable: kind === 'cost' ? await clientCostsRecordable() : true,
  })
}

export async function saveContract(_prev: EntryResult, form: FormData): Promise<EntryResult> {
  return run('contract', form)
}
export async function savePayment(_prev: EntryResult, form: FormData): Promise<EntryResult> {
  return run('payment', form)
}
export async function saveCost(_prev: EntryResult, form: FormData): Promise<EntryResult> {
  return run('cost', form)
}
