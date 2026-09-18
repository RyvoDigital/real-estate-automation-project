import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readSilence } from '@/lib/matching/silence-read'
import { SILENCE } from '@/lib/matching/screen-copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The silence — Automation 03 §7, the half of nurture that needs no sends.
 *
 * It is the product's argument in one sentence, made from data that already
 * exists: before any threshold is configured, before Meta approves anything,
 * and before a single message goes out.
 *
 * ⚠️ IT SURFACES AND DOES NOT ACT. There is no button here. §7 and §6.2 are
 * clear that reaching these people is consent-gated and paced, and a "contact
 * them all" control on a screen designed to produce indignation is how an
 * agency's database gets burned in an afternoon.
 */
export default async function Silence({ params }: { params: Promise<{ clientId: string }> }) {
  await requireOperator()
  const { clientId } = await params
  const clients = await getClients()
  const name = clients.find((c) => c.id === clientId)?.name ?? ''
  const s = await readSilence(clientId)

  const toldUs = s.silent.length + s.unknownClock + s.recentlySpoken

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{SILENCE.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{name}</p>

      {toldUs === 0 ? (
        <p style={{ marginTop: 32 }}>{SILENCE.nobodySaidAnything}</p>
      ) : s.silent.length === 0 ? (
        <p style={{ marginTop: 32 }}>{SILENCE.none}</p>
      ) : (
        <p style={{ fontSize: 22, marginTop: 32, lineHeight: 1.4 }}>
          {s.silent.length === 1
            ? SILENCE.headlineOne(s.silent[0].days)
            : SILENCE.headlineMany(s.silent.length, s.thresholdDays)}
        </p>
      )}

      {/* The denominator, always, so the headline cannot be read as the whole
          list — and the two counts that are NOT in it, rather than folded in. */}
      <p style={{ color: '#555', fontSize: 14 }}>{SILENCE.outOfTotal(s.totalLeads)}</p>
      {s.unknownClock > 0 && (
        <p style={{ color: '#555', fontSize: 14 }}>
          {s.unknownClock === 1 ? SILENCE.unknownClockOne : SILENCE.unknownClockMany(s.unknownClock)}
        </p>
      )}
      {s.recentlySpoken > 0 && (
        <p style={{ color: '#555', fontSize: 14 }}>
          {s.recentlySpoken === 1 ? SILENCE.recentlyOne : SILENCE.recentlyMany(s.recentlySpoken)}
        </p>
      )}

      {s.silent.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 32 }}>
          {s.silent.map((l) => (
            <li key={l.leadId} style={{ padding: '14px 0', borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 18 }}>{l.name ?? SILENCE.nameless}</div>
              <div style={{ color: '#555', fontSize: 14 }}>
                {SILENCE.silentFor(l.days)} · {SILENCE.lastSpoke}: {l.since.slice(0, 10)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
