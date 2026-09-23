import { Bar, Panel, Reading } from '@/components/PageSkeleton'
import styles from '@/components/infrastructure/infrastructure.module.css'

/*
 * Infrastructure, while it is being read. Its geometry is .page/.head from
 * infrastructure.module.css, the screen's own.
 *
 * 🔒 NO CHECK COUNT, not even as a number of bars: the count comes from the
 * run (tests/infrastructure.test.ts, "NO SURFACE HARDCODES A CHECK COUNT"),
 * and a skeleton promising thirteen rows would be a surface doing exactly that.
 */
export default function Loading() {
  return (
    <Reading>
      <div className={styles.page}>
        <header className={styles.head}>
          <Bar w={210} h={28} r={10} />
          <Bar w="min(60ch, 100%)" h={15} />
        </header>
        <Panel rows={3} />
        <Panel rows={2} />
      </div>
    </Reading>
  )
}
