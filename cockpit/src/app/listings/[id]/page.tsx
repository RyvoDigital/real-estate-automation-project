import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { readMatches } from '@/lib/matching/screen-read'
import { MATCHES, STATUS_WORD } from '@/lib/matching/screen-copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Who a listing serves, and — far more often, today — why nobody was proposed.
 *
 * The refusal is the point of this screen existing. No client has answered the
 * calibration questions, so every run refuses, and an operator opening this
 * needs to read a sentence rather than an empty list. "Nothing here" and "we
 * could not decide" look identical and mean completely different things.
 */
export default async function ListingMatches({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator()
  const { id } = await params
  const screen = await readMatches(id)
  if (!screen.listing) notFound()

  const l = screen.listing
  const computed = screen.matches.filter((m) => m.origin === 'computed')
  const chosen = screen.matches.filter((m) => m.origin === 'agent')
  const head = [l.reference, l.area, l.price === null ? null : `€${l.price.toLocaleString('pt-PT')}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{MATCHES.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{head}</p>
      <p style={{ color: l.status === 'available' ? '#555' : '#8a1f1f', fontSize: 14 }}>
        {STATUS_WORD[l.status] ?? l.status}
      </p>

      {l.status !== 'available' && (
        <p style={{ marginTop: 32, padding: 16, background: '#faf6f6', borderLeft: '3px solid #8a1f1f' }}>
          {MATCHES.notAvailable}
        </p>
      )}

      {screen.missingThresholds.length > 0 && (
        <section style={{ marginTop: 32, padding: 16, background: '#f7f5f0', borderLeft: '3px solid #b8a06a' }}>
          <p style={{ margin: 0 }}>{MATCHES.notCalibrated}</p>
          {screen.clientId && (
            <p style={{ marginBottom: 0 }}>
              <Link
                href={`/calibrate/${screen.clientId}`}
                style={{ minHeight: 44, display: 'inline-block', lineHeight: '44px' }}
              >
                {MATCHES.notCalibratedAction}
              </Link>
            </p>
          )}
        </section>
      )}

      {screen.matches.length === 0 && screen.missingThresholds.length === 0 && (
        <p style={{ marginTop: 32 }}>{MATCHES.none}</p>
      )}

      {computed.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 20 }}>{MATCHES.computedHeading}</h2>
          {computed.map((m) => (
            <article key={m.leadId} style={{ padding: '16px 0', borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 18 }}>{m.name ?? ''}</div>
              <div style={{ color: '#555', fontSize: 14 }}>
                {m.strength ? MATCHES.strengthWord[m.strength] ?? '' : ''}
                {m.monthsSinceContact === null
                  ? ` · ${MATCHES.neverContacted}`
                  : m.monthsSinceContact === 1
                    ? ` · ${MATCHES.lastSpokeOne}`
                    : m.monthsSinceContact > 1
                      ? ` · ${MATCHES.lastSpokeMany(m.monthsSinceContact)}`
                      : ''}
              </div>
              {m.filterWouldFind === false && (
                <div style={{ fontSize: 14 }}>{MATCHES.aFilterWouldMiss}</div>
              )}
              {m.reasons.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ minHeight: 44, lineHeight: '44px', fontSize: 14, cursor: 'pointer' }}>
                    {MATCHES.engineWordsHeading}
                  </summary>
                  <ul style={{ fontSize: 14, color: '#333' }}>
                    {m.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </section>
      )}

      {chosen.length > 0 && (
        <section style={{ marginTop: 40 }}>
          {/* Separate from the computed block, always. 0025 makes the two
              unmergeable in the database; this is the same rule at the reading
              end, so a person's pick never borrows a computed match's
              authority. */}
          <h2 style={{ fontSize: 20 }}>{MATCHES.chosenHeading}</h2>
          {chosen.map((m) => (
            <article key={m.leadId} style={{ padding: '16px 0', borderTop: '1px solid #eee' }}>
              <div style={{ fontSize: 18 }}>{m.name ?? ''}</div>
              <div style={{ color: '#555', fontSize: 14 }}>
                {m.chosenReason ?? ''}
                {m.chosenBy ? ` (${MATCHES.chosenBy(m.chosenBy)})` : ''}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
