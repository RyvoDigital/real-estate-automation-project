import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { UI } from '@/lib/segmentation/copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Standalone, per improvements §3.17 — deliberately NOT inside the cockpit's
 * single-agency Shell.
 *
 * Two reasons. The frame decision has not been taken, so wiring it into the old
 * navigation would be building against a frame we have decided to replace. And
 * this screen is used in a meeting with the laptop turned around: a nav bar
 * listing other clients' leads and queues is not a thing to show somebody.
 */
export default async function SegmentationIndex() {
  await requireOperator()
  const clients = await getClients()

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{UI.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{UI.intro}</p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 32 }}>
        {clients.map((c) => (
          <li key={c.id} style={{ padding: '14px 0', borderTop: '1px solid #eee' }}>
            <Link href={`/segmentation/${c.id}`} style={{ fontSize: 18 }}>{c.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
