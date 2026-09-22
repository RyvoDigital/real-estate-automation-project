import 'server-only'
import { cache } from 'react'
import { getClients } from '@/lib/data'

/**
 * The agencies the switcher offers (brief §1.3), read once per request.
 *
 *   🔒 CACHED PER REQUEST, not across them. React's cache() dedupes the read
 *      for the one render — the frame is drawn once per page — while a stale
 *      list across requests would offer an agency that has since been taken on
 *      or renamed.
 *   🔒 NEVER CALLED IN PRESENTED MODE. The Frame does not call this when the
 *      laptop is turned around: §1.4 forbids another client's name appearing
 *      anywhere in that HTML, and the safe way to honour that is not to read.
 *   🔴 A FAILED READ IS AN EMPTY LIST, NOT A THROWN PAGE. The chrome must not
 *      take a screen down because the switcher could not be filled; the menu
 *      says there is nothing to switch to, which is what it knows.
 */
export const switcherClients = cache(async (): Promise<{ id: string; name: string }[]> => {
  try {
    return await getClients()
  } catch {
    return []
  }
})
