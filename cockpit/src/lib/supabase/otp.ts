import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * The client that SENDS the magic link. Deliberately not the SSR client.
 *
 * @supabase/ssr's createServerClient defaults to the PKCE flow, which stores
 * a code_verifier in a cookie on the requesting browser and makes the link
 * only openable in that same browser. That is fatal here: requesting a link
 * on a laptop and opening it on a phone is the normal working pattern for
 * this product, not an edge case — the escalation queue exists to be read
 * between viewings.
 *
 * So the send path uses a plain client with the implicit flow and no
 * storage at all. Nothing is written on the requesting device, so there is
 * nothing for the opening device to be missing. Verification happens
 * server-side against the token hash in the link (see auth/callback).
 */
export function otpClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')

  return createClient(url, key, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
