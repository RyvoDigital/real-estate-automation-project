import { Bar, Panel, Reading } from '@/components/PageSkeleton'
import styles from '@/components/clients/clients.module.css'

/*
 * Clients, while it is being read — the slowest screen in the cockpit at the
 * time this was written (1018ms to first byte, 23 Sep 2026). The geometry is
 * clients.module.css, the screen's own.
 */
export default function Loading() {
  return (
    <Reading>
      <div className={styles.page}>
        <Bar w={148} h={28} r={10} />
        <Bar w="min(60ch, 100%)" h={15} />
        <Panel rows={4} />
      </div>
    </Reading>
  )
}
