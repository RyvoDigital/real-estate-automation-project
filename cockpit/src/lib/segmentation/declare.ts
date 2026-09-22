import 'server-only'

import { randomUUID } from 'node:crypto'
import { admin } from '@/lib/supabase/admin'
import {
  declareSegment as declareWith,
  type DeclareDeps,
  type DeclareInput,
  type DeclareResult,
} from '@/lib/segmentation/declare-core'

/**
 * Writing a declaration: the real dependencies for the pure core in
 * declare-core.ts, where every rule lives and is tested.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE AGENCY DECLARES. WE RECORD. THEY ARE DIFFERENT PEOPLE AND THE ROW   │
 * │ SAYS SO.                                                                │
 * │                                                                         │
 * │   declared_by            the person AT THE AGENCY who knows             │
 * │   evidence.recorded_by   the operator holding the pen                   │
 * │                                                                         │
 * │ Merging them is the simplification somebody will propose — in the       │
 * │ meeting it IS one laptop with one operator driving — and it would put   │
 * │ OUR name on THEIR assertion. If a supervisory authority asks who said   │
 * │ these were past clients, the answer must be the person who KNEW, not    │
 * │ the person who typed. 0024 makes the author structural; this keeps the  │
 * │ two apart.                                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Nothing here can send: it inserts into consent_events and nothing else. No
 * gate, no permit, no adapter, and no update: the store below has one verb.
 */

export type { Segment } from '@/lib/segmentation/declare-types'
export type { DeclareInput, DeclareResult } from '@/lib/segmentation/declare-core'
export { validateDeclaration } from '@/lib/segmentation/declare-core'

const deps: DeclareDeps = {
  // 🔒 ONE request, ONE INSERT statement (PostgREST bulk insert): all rows or none.
  insertAll: async (rows) => {
    const { error } = await admin().from('consent_events').insert(rows)
    return { error: error ? error.message : null }
  },
  now: () => new Date(),
  newId: () => randomUUID(),
}

export function declareSegment(input: DeclareInput): Promise<DeclareResult> {
  return declareWith(input, deps)
}
