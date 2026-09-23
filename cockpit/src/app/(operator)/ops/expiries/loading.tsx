import { Bar, Panel, Reading } from '@/components/PageSkeleton'
import styles from '@/components/expiries/expiries.module.css'

/*
 * Expiries, while it is being read. Geometry from expiries.module.css.
 */
export default function Loading() {
  return (
    <Reading>
      <div className={styles.page}>
        <Bar w={150} h={28} r={10} />
        <Bar w="min(60ch, 100%)" h={15} />
        <Panel rows={3} />
        <Panel rows={2} />
      </div>
    </Reading>
  )
}
