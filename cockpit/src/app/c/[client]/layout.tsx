import { ViewTransition } from 'react'
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
      {/*
        * 🔴 THE BOUNDARY A NAVIGATION ANIMATES ACROSS (Stage 3, 23 Sep 2026).
        * Its presence is what makes the browser run a view transition at all;
        * WHAT moves is decided in src/app/motion.css, against the names in
        * Frame.module.css — the screen leaves, the chrome does not, and the
        * destination arrives at full strength.
        *
        * 🔴 NO PROPS, AND THAT IS THE POINT. This was written as
        * `<ViewTransition exit="screen" enter="none" default="none">`, reading
        * the API as "opt everything out and let the CSS names decide". React
        * took it at its word and skipped the transition entirely:
        * startViewTransition was called ZERO times. Measured by
        * tests/probe-transition.ts, which is the only reason it was found —
        * the build compiled, the CSS was correct, and nothing happened.
        */}
      <ViewTransition>{children}</ViewTransition>
    </Frame>
  )
}
