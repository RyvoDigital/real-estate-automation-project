import { frameSide } from '@/lib/frame'
import styles from './Frame.module.css'
import skeleton from './FrameSkeleton.module.css'

/**
 * THE FRAME, WHILE A SCREEN IS STILL BEING READ (23 Sep 2026).
 *
 * 🔴 WHY THIS EXISTS. /onboarding was rebuilt on the Frame and kept its old
 * loading.tsx, which rendered SkeletonShell — the OLD chrome, with the Queue /
 * Leads / Report tab bar and a five-step wizard that no longer exists. Next
 * paints a loading boundary over the WHOLE viewport when the shared layout is
 * the root, so every navigation into onboarding flashed the retired cockpit
 * before the new one arrived. That flash is why the cockpit read as
 * half-migrated.
 *
 *   🔒 THE SAME GEOMETRY AS THE FRAME, so nothing shifts when the real screen
 *      replaces it: the same sidebar, the same nav, from the same frame.ts.
 *   🔒 IT READS NOTHING. A loading state that awaited anything would be the
 *      thing it is covering for. No counts, no client list, no session — so no
 *      badge and no switcher, and their absence shifts nothing because both sit
 *      above the nav in their own boxes.
 *   🔒 IT IS NOT the old Skeleton: it imports neither Skeleton nor Shell, and
 *      tests/frame-skeleton.test.ts holds that line for every Frame route.
 *   🔒 NO NUMBERS AND NO WORDS FROM THE SCREEN. A skeleton that guessed at
 *      content would be asserting something before it had read it; these are
 *      plain bars, and the only real words are the nav's, which are static.
 */
export function FrameSkeleton({ current }: { current: string }) {
  const side = frameSide('operator', { current })
  return (
    <div className={styles.app}>
      <aside className={styles.side}>
        <div className={styles.brand}>Ryvo</div>

        {/*
          * 🔴 THE SPACE THE CHROME WILL TAKE, RESERVED (23 Sep 2026). The
          * skeleton had two boxes down the side where the real frame has four —
          * the "Open a client" control and the operator's line were missing —
          * so the nav sat 58px too high and the whole sidebar dropped when the
          * real screen arrived. The flash was gone; the jump was not.
          *
          * 🔒 They are BLANKS, never controls: this component reads nothing, so
          * it has no client list to offer and no session to name. Matching the
          * metrics is the whole job. Measured: navDelta 58 before, 0 after.
          */}
        <div className={skeleton.switcherSlot} aria-hidden="true" />

        <nav className={styles.nav} aria-label="Sections">
          {/* The section label the frame uses at the operator level. */}
          <span className={styles.navLabel}>Ryvo</span>
          {side.items.map((item) => (
            <span
              key={item.slug}
              className={styles.item}
              aria-current={item.slug === current ? 'page' : undefined}
            >
              <span>{item.label}</span>
            </span>
          ))}
        </nav>
        <div className={styles.foot} aria-hidden="true">
          <span className={`${skeleton.bar} ${skeleton.footLine}`} />
        </div>
      </aside>

      <main className={styles.main}>
        <div className={skeleton.page} aria-busy="true" aria-label="Reading…">
          <span className={`${skeleton.bar} ${skeleton.title}`} />
          <span className={`${skeleton.bar} ${skeleton.lede}`} />
          <div className={skeleton.panel}>
            <span className={`${skeleton.bar} ${skeleton.row}`} />
            <span className={`${skeleton.bar} ${skeleton.row}`} />
            <span className={`${skeleton.bar} ${skeleton.row}`} />
          </div>
        </div>
      </main>
    </div>
  )
}
