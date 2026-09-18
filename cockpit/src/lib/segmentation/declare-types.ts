/**
 * The segment type alone, importable from a browser bundle.
 *
 * declare.ts imports 'server-only', so anything needing just the type would drag
 * the write path into a client graph — the same split that gate.ts needed, for
 * the same reason (§11c).
 */
export type Segment = 'A' | 'B' | 'C' | 'D'
