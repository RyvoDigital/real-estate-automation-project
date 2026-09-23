import { Bar, Panel, Reading } from '@/components/PageSkeleton'
import styles from '@/components/today/today.module.css'

/*
 * Today, while it is being read. The geometry is today.module.css — the same
 * .page and .header the screen itself uses — so nothing shifts when it lands.
 * The five groups are five panels because Today has five (brief §2.1); they
 * are plain bars, and say nothing about what is in them.
 */
export default function Loading() {
  return (
    <Reading>
      <div className={styles.page}>
        <header className={styles.header}>
          <Bar w={132} h={28} r={10} />
        </header>
        <Panel rows={3} />
        <Panel rows={2} />
        <Panel rows={2} />
        <Panel rows={2} />
        <Panel rows={2} />
      </div>
    </Reading>
  )
}
