'use server'

import { revalidatePath } from 'next/cache'
import { requireOperator } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { readOnboardingOne } from '@/lib/onboarding-read'
import { saveRecord, type RecordKind, type RecordResult } from '@/lib/onboarding-record'

/*
 * The thin server actions for the two onboarding records (lib/onboarding-record.ts
 * holds every rule and is tested with fakes). The client, its creation day, today
 * and the clients a routing proof may name are read HERE, on the server, from the
 * client id: never taken from the form, which only says which client it is about.
 */

async function record(kind: RecordKind, form: FormData): Promise<RecordResult> {
  const operator = await requireOperator()
  const clientId = String(form.get('client_id') ?? '')
  const one = /^[0-9a-f-]{36}$/i.test(clientId) ? await readOnboardingOne(clientId) : null
  if (!one) return { ok: false, message: 'Not recorded: that client could not be read.', values: {}, errors: {} }
  return saveRecord(kind, form, operator.email, {
    clientId, createdOn: one.createdOn, today: one.today, otherClientIds: one.others.map((o) => o.id),
  }, {
    recordable: one.recordable,
    async insert(row) {
      const { error } = await admin().from('onboarding_records').insert(row)
      return { error: error ? { message: error.message } : null }
    },
    revalidate: (p) => revalidatePath(p),
  })
}

export async function recordRouting(_prev: RecordResult, form: FormData): Promise<RecordResult> {
  return record('routing', form)
}

export async function recordDisclosure(_prev: RecordResult, form: FormData): Promise<RecordResult> {
  return record('disclosure', form)
}
