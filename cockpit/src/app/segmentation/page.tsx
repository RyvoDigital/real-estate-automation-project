import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { UI } from '@/lib/segmentation/copy'
import { SURFACE } from '@/lib/segmentation/surface'
import styles from '@/components/segmentation/segmentation.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Standalone, per improvements §3.17 — deliberately NOT inside the cockpit's
 * frame: this screen is used in a meeting with the laptop turned around, and a
 * nav bar listing other clients' leads and queues is not a thing to show
 * somebody. Colours from surface.ts, layout from the segmentation module
 * (redrawn 22 Sep 2026 with the client screen).
 */
export default async function SegmentationIndex() {
  await requireOperator()
  const clients = await getClients()

  return (
    <main className={styles.page} style={{ ...SURFACE.page }}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <h1 className={styles.title}>{UI.title}</h1>
          <p className={styles.intro} style={{ color: SURFACE.page.muted }}>{UI.intro}</p>
        </header>
        <div className={styles.groups}>
          {clients.map((c) => (
            <Link key={c.id} href={`/segmentation/${c.id}`} className={styles.row}>
              <span className={styles.groupName}>{c.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
