import { redirect } from 'next/navigation'

/**
 * /health moved to /ops/infrastructure on 22 Sep 2026, with the rest of the
 * operator level (brief §1.2, §2.4). The route stays as a redirect rather than
 * a 404: it is in the runbook, in old notes and in anybody's bookmarks, and a
 * screen you open when you already suspect something is the worst one to lose
 * on the day it matters.
 */
export default function HealthMoved() {
  redirect('/ops/infrastructure')
}
