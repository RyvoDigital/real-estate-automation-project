import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The service_role client. Bypasses RLS entirely.
 *
 * `import 'server-only'` at the top of this file is the mechanical control:
 * if any client component ever imports this module — directly or through a
 * chain of imports — the build FAILS rather than shipping the key. That is
 * deliberate. A convention that says "only import this on the server" is a
 * note-to-self; a build error is a consumer.
 *
 * RLS is enabled on all nine tables with zero policies, so this key is the
 * only thing that can read anything. Which is exactly why it must never
 * leave the server: see §4 of the checkpoint spec.
 */

let cached: SupabaseClient | null = null

export function admin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Fail loudly and at once. A client built from an empty key produces
  // confident-looking 401s at query time, several layers from the cause —
  // the same shape as the `--env-file` incident in §1c of the lessons file,
  // where an empty substitution produced a valid-looking wrong config.
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return cached
}
