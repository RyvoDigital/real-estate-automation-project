import 'server-only'
import { admin } from '@/lib/supabase/admin'

/**
 * The agency's own locale (clients.locale: 'pt-PT', 'es-ES', …), for saying a
 * refusal in its language (lib/refusals.ts). A failed read falls back to
 * Portuguese: this chooses the language a sentence is shown in, and records
 * nothing, so a default here asserts nothing about anybody.
 */
export async function readClientLocale(clientId: string | null | undefined): Promise<string | null> {
  if (!clientId) return null
  const { data, error } = await admin().from('clients').select('locale').eq('id', clientId).maybeSingle()
  return error ? null : ((data?.locale as string | null) ?? null)
}
