import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { assertPresentable } from '@/lib/frame'
import { Notice } from '@/components/Notice'
import { readNotice } from '../../../c/[client]/notice/page'

/*
 * The agency's view — the same screen, read in the room with them.
 *
 * 🔴 assertPresentable('notice') IS THE BOUNDARY, and the literal is the point.
 *
 * proxy.ts already 404s a /p/ path for a screen that refuses presentation, and
 * the top of that file records why that is not enough: Next's middleware has
 * been bypassable by a crafted request header (CVE-2025-29927), and *a check
 * the caller can skip is not a check*. The proxy also hands the layout the
 * screen slug on a header, which is exactly the kind of value a forged request
 * controls.
 *
 * So the page asserts its own identity, from a literal in its own source, on
 * the path the real caller takes — the same shape as requireOperator() being
 * called by every page rather than trusted from the edge.
 *
 * 🔒 And the body is <Notice/>, the same component the operator's route
 * renders. What an agency is shown and what the operator read beforehand
 * cannot drift, because there is nothing to drift between.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PresentedNoticePage({
  params,
}: {
  params: Promise<{ client: string }>
}) {
  assertPresentable('notice')
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  if (!clients.some((c) => c.id === clientId)) notFound()
  const { clearances, policy, agency } = await readNotice(clientId)
  return <Notice clearances={clearances} policy={policy} agency={agency} />
}
