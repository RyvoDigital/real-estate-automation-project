import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { CALIBRATE } from '@/lib/matching/screen-copy'
import { SURFACE } from '@/lib/segmentation/surface'
import styles from '@/components/calibrate/calibrate.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** Which agency to calibrate. Redrawn 22 Sep 2026 with the calibration screen. */
export default async function CalibrateIndex() {
  await requireOperator()
  const clients = await getClients()
  return (
    <main className={styles.page} style={{ ...SURFACE.page }}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <h1 className={styles.title}>{CALIBRATE.title}</h1>
          <p className={styles.intro} style={{ color: SURFACE.page.muted }}>{CALIBRATE.intro} {CALIBRATE.pick}</p>
        </header>
        <div className={styles.list}>
          {clients.map((c) => <Link key={c.id} href={`/calibrate/${c.id}`} className={styles.clientRow}>{c.name}</Link>)}
        </div>
      </div>
    </main>
  )
}
