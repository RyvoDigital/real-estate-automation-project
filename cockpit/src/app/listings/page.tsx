import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readListings } from '@/lib/matching/screen-read'
import { LISTINGS, STATUS_WORD } from '@/lib/matching/screen-copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Standalone, per improvements §3.17 — deliberately NOT inside the cockpit's
 * single-agency Shell, for the same two reasons the segmentation screen is not:
 * the frame decision has not been taken, and this may be shown to somebody.
 *
 * ⚠️ THIS SCREEN NEVER TRIGGERS A MATCHING RUN. It reads what a run already
 * found. An operator refreshing a page must not rewrite match rows — and on a
 * notified listing that would be an attempt to change a record somebody has
 * already acted on, which 0025's freeze refuses anyway.
 */
export default async function Listings({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>
}) {
  await requireOperator()
  const { client } = await searchParams
  const clients = await getClients()

  if (!client) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{LISTINGS.title}</h1>
        <p style={{ color: '#555', marginTop: 0 }}>{LISTINGS.intro}</p>
        <p style={{ color: '#555' }}>{LISTINGS.pick}</p>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
          {clients.map((c) => (
            <li key={c.id} style={{ padding: '14px 0', borderTop: '1px solid #eee' }}>
              <Link
                href={`/listings?client=${c.id}`}
                style={{ fontSize: 18, minHeight: 44, display: 'inline-block', lineHeight: '44px' }}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  const rows = await readListings(client)
  const name = clients.find((c) => c.id === client)?.name ?? ''

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{LISTINGS.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{name}</p>

      {rows.length === 0 ? (
        <p style={{ marginTop: 32 }}>{LISTINGS.empty}</p>
      ) : (
        <>
          {/* The n=1 rule: a count of one never reads as "1 imóveis". */}
          <p style={{ color: '#555' }}>
            {rows.length === 1 ? LISTINGS.countOne : LISTINGS.countMany(rows.length)}
          </p>
          <p style={{ color: '#555', fontSize: 14 }}>{LISTINGS.onlyAvailableMatches}</p>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
            {rows.map((l) => (
              <li key={l.id} style={{ padding: '16px 0', borderTop: '1px solid #eee' }}>
                <Link
                  href={`/listings/${l.id}`}
                  style={{ fontSize: 18, minHeight: 44, display: 'inline-block' }}
                >
                  {[l.reference, l.bedrooms === null ? null : `T${l.bedrooms}`, l.area,
                    l.price === null ? null : `€${l.price.toLocaleString('pt-PT')}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Link>
                <div style={{ color: l.status === 'available' ? '#555' : '#8a1f1f', fontSize: 14 }}>
                  {STATUS_WORD[l.status] ?? l.status}
                  {l.status === 'available' ? '' : ` — ${LISTINGS.notMatched}`}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
