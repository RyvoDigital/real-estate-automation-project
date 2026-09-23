/*
 * HOW MANY TIMES A SCREEN ASKS THE DATABASE, AND HOW MANY OF THOSE IT WAITS
 * FOR IN A ROW.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local tests/probe-roundtrips.ts
 *   npm run probe:roundtrips
 *
 * WHY THIS EXISTS. /clients took 1018ms to first byte in production and the
 * obvious suspicion was a slow query. It was not. Every one of its 32 requests
 * came back between 95 and 237ms, none an outlier, while the heaviest of them
 * — a `leads` read — executes in **6.5ms** inside Postgres on an index, against
 * a database of 226 leads and 3 clients. A trivial `select id limit 1` on an
 * already-open connection still takes ~100ms.
 *
 * So the cost is not any one question. It is the NUMBER of questions, and how
 * many of them are asked one after another rather than together. Those are the
 * two numbers this prints, and they are the two Stage 2 is trying to move:
 *
 *   requests      how many times the screen asks anything at all
 *   serial depth  the longest chain of asks that must wait for each other,
 *                 estimated as wall clock ÷ the median request — which is what
 *                 actually sets the wait, since the rest overlap
 *
 * 🔴 WHAT IT CANNOT SEE, AND THIS MATTERS. It calls the read modules directly,
 * NOT inside a React render — so `cache()` is inert here. Proved rather than
 * assumed: calling getClients() three times under this probe fires three
 * requests, and the same three calls inside a page fire one.
 *
 * So the number below is the RAW fan-out: how many times a screen would ask if
 * nothing deduped it. That is the right number for the work that removes asks —
 * a per-client loop becoming one query per table — and the wrong number for
 * work that dedupes them. For the dedupe, measure a real render:
 *
 *     PROBE_BASE=http://127.0.0.1:3123 npx tsx tests/probe-timing.ts
 *
 * 🔒 IT READS PRODUCTION, READ-ONLY, THROUGH THE SCREENS' OWN READS. It prints
 * counts and timings and table names. It never prints a row.
 */
import { readFileSync } from 'node:fs'

for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

type Call = { table: string; ms: number }

/** Every PostgREST request made while `fn` runs, with how long each took. */
async function trace(fn: () => Promise<unknown>): Promise<{ calls: Call[]; wall: number }> {
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url
    const t = process.hrtime.bigint()
    const res = await original(...args)
    const ms = Number(process.hrtime.bigint() - t) / 1e6
    try {
      const u = new URL(url)
      if (u.pathname.includes('/rest/v1/')) calls.push({ table: u.pathname.replace('/rest/v1/', ''), ms })
    } catch { /* not a URL we care about */ }
    return res
  }
  const t0 = process.hrtime.bigint()
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
  return { calls, wall: Number(process.hrtime.bigint() - t0) / 1e6 }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

async function main() {
  const now = new Date()
  const g = async (p: string, n: string) => {
    const m = (await import(p)) as Record<string, unknown>
    const d = m.default as Record<string, unknown> | undefined
    return ((d && d[n]) ?? m[n]) as (...a: unknown[]) => Promise<unknown>
  }

  const readClientList = await g('../src/lib/clients/read.ts', 'readClientList')
  const readToday = await g('../src/lib/today/read.ts', 'readToday')
  const readExpiries = await g('../src/lib/expiries/read.ts', 'readExpiries')
  const readInfrastructure = await g('../src/lib/infrastructure/read.ts', 'readInfrastructure')

  const screens: { name: string; run: () => Promise<unknown> }[] = [
    { name: '/clients', run: () => readClientList(now) },
    { name: '/today', run: () => readToday(now, 14, false) },
    { name: '/ops/expiries', run: () => readExpiries(now, false) },
    { name: '/ops/infrastructure', run: () => readInfrastructure(now) },
  ]

  console.log('\nRound trips per screen — production, read-only\n')
  console.log('   screen                requests   median   wall clock   serial depth')

  const perScreen: { name: string; calls: Call[] }[] = []
  for (const s of screens) {
    await s.run() // warm: the first call pays for the client and the DNS
    const { calls, wall } = await trace(s.run)
    const med = median(calls.map((c) => c.ms))
    const depth = med > 0 ? wall / med : 0
    perScreen.push({ name: s.name, calls })
    console.log(
      `   ${s.name.padEnd(20)}  ${String(calls.length).padStart(8)}   ${`${Math.round(med)}ms`.padStart(6)}` +
        `   ${`${Math.round(wall)}ms`.padStart(10)}   ${depth.toFixed(1).padStart(12)}`,
    )
  }

  // Which tables are asked more than once in a single screen, and how often.
  console.log('\n   asked more than once in one render:')
  let anyRepeat = false
  for (const { name, calls } of perScreen) {
    const by = new Map<string, number>()
    for (const c of calls) by.set(c.table, (by.get(c.table) ?? 0) + 1)
    const repeats = [...by.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])
    if (repeats.length === 0) continue
    anyRepeat = true
    console.log(`     ${name}: ${repeats.map(([t, n]) => `${t} ×${n}`).join(', ')}`)
  }
  if (!anyRepeat) console.log('     nothing — every table is asked once per screen')
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
