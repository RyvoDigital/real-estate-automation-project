import { Bar, Column, Panel, Reading } from '@/components/PageSkeleton'

/*
 * Every `/c/<client>/…` screen, while it is being read — eighteen of them,
 * which until 23 Sep 2026 had no loading boundary at all. On a slow connection
 * each showed the PREVIOUS screen for the whole server render, so a click on a
 * client's Escalations looked like a click that had not registered.
 *
 * The client frame is already this route's layout (`c/[client]/layout.tsx`), so
 * this covers <main> alone: the sidebar, the switcher and the way up do not
 * blink.
 *
 * 🔒 DELIBERATELY NEUTRAL, and that is not laziness. One boundary covers
 * eighteen screens with eighteen stylesheets, so there is no single
 * destination's geometry to inherit — and a skeleton shaped like the
 * Escalations list would be a lie on Templates. A screen that wants its own
 * shape adds a loading.tsx beside its own page.tsx and gets it.
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
