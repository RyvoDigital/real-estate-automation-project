import { Bar, Column, Panel, Reading } from '@/components/PageSkeleton'

/*
 * The PRESENTED frame, while its screen is being read (23 Sep 2026).
 *
 * Found by the rule rather than by hand: this route was the one framed screen
 * still sending nothing until its render had finished, and it is the one shown
 * to an agency with somebody watching — the worst place in the cockpit for a
 * click that appears to do nothing.
 *
 * 🔒 IT NAMES NOBODY, which §1.4 requires of everything served on a presented
 * route: no other client's name may appear in the HTML, options and payloads
 * included. Plain bars satisfy that by having no words at all — and the same
 * rule that keeps a skeleton from asserting what it has not read keeps it from
 * naming anyone.
 *
 * 🔒 Neutral geometry, deliberately: like the client group, this covers
 * whatever presented screens exist rather than one known destination.
 */
export default function Loading() {
  return (
    <Reading>
      <Column>
        <Bar w={180} h={28} r={10} />
        <Bar w="min(60ch, 100%)" h={15} />
        <Panel rows={3} />
      </Column>
    </Reading>
  )
}
