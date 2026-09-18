import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { SILENCE } from '@/lib/matching/screen-copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SilenceIndex() {
  await requireOperator()
  const clients = await getClients()
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{SILENCE.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{SILENCE.intro}</p>
      <p style={{ color: '#555' }}>{SILENCE.pick}</p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
        {clients.map((c) => (
          <li key={c.id} style={{ padding: '14px 0', borderTop: '1px solid #eee' }}>
            <Link href={`/silence/${c.id}`} style={{ fontSize: 18, minHeight: 44, display: 'inline-block', lineHeight: '44px' }}>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
