import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { Frame } from '@/components/Frame'

/**
 * The presented frame — the same Frame, in its presented state.
 *
 * 🔒 It passes `counts: null` and the frame shows none, because
 * `frameSide('presented')` reports `showsCounts: false`. The null is not a
 * failed read here; it is that there is nothing this frame is allowed to count.
 *
 * A screen that refuses presentation never reaches this layout: the middleware
 * 404s it at the edge, before anything renders.
 */
export default async function PresentedLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ client: string }>
}) {
  const [operator, { client: clientId }] = await Promise.all([requireOperator(), params])
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const screen = await headers().then((h) => h.get('x-ryvo-screen') ?? '')

  return (
    <Frame mode="presented" client={{ id: client.id, name: client.name }} current={screen} counts={null} operatorEmail={operator.email}>
      {children}
    </Frame>
  )
}
