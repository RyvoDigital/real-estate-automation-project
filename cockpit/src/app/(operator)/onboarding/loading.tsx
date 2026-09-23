import { Bar, Panel, Reading } from '@/components/PageSkeleton'
import styles from '@/components/onboarding/onboarding.module.css'

/*
 * Onboarding, while it is being read — and the route this whole piece of work
 * started on.
 *
 * 🔴 IT USED TO DRAW THE WHOLE FRAME, and before that the RETIRED frame: this
 * file rendered SkeletonShell (the Queue / Leads / Report tab bar and a
 * five-step wizard that no longer exists) until 23 Sep 2026, then FrameSkeleton
 * — which was correct while the page rendered <Frame> itself, but still meant
 * the sidebar blinked out and back on every navigation into onboarding. The
 * frame is now the group's layout, so this covers <main> and nothing else.
 *
 * The geometry is onboarding.module.css: .page, .top, .lede — the screen's own.
 */
export default function Loading() {
  return (
    <Reading>
      <div className={styles.page}>
        <div className={styles.top}>
          <Bar w={168} h={28} r={10} />
        </div>
        <Bar w="min(70ch, 100%)" h={15} />
        <Panel rows={4} />
      </div>
    </Reading>
  )
}
