import { Bar, Panel, Reading } from '@/components/PageSkeleton'
import styles from '@/components/month/month.module.css'

/*
 * The Month (`/`), while it is being read, and the group's fallback for any
 * operator screen added later without one of its own — which is why it is here
 * rather than beside a page.tsx. Geometry from month.module.css's .desk.
 *
 * 🔒 A route added to this group gets a boundary by default. The alternative
 * is that it silently gets none, which is the state the whole cockpit was in
 * on 23 Sep 2026: 28 of 42 routes, every one of them holding the previous
 * screen for the length of a server render.
 */
export default function Loading() {
  return (
    <Reading>
      <div className={styles.desk}>
        <Bar w={200} h={28} r={10} />
        <Panel rows={4} />
        <Panel rows={3} />
      </div>
    </Reading>
  )
}
