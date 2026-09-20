import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readCounts } from '@/lib/counts'
import { Frame } from '@/components/Frame'

/**
 * The client frame. Every `/c/<client>/…` screen renders inside this.
 *
 * 🔒 THE COUNTS ARE READ HERE, ONCE. Not in the frame, not in the page, and
 * never twice. docs/cockpit-build-plan.md §1.1 — a count computed in two
 * places is two code paths that agree until one of them learns something.
 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ client: string }>
}) {
  const [operator, { client: clientId }] = await Promise.all([requireOperator(), params])
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  // An unknown client is a 404 rather than an empty frame naming nobody.
  if (!client) notFound()

  const [counts, screen] = await Promise.all([readCounts(), headers().then((h) => h.get('x-ryvo-screen') ?? '')])

  return (
    <Frame mode="client" client={{ id: client.id, name: client.name }} current={screen} counts={counts} operatorEmail={operator.email}>
      {children}
    </Frame>
  )
}
