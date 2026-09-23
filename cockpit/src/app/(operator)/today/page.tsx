import { requireOperator } from '@/lib/auth'
import { ANOMALY_WINDOW_DAYS } from '@/lib/data'
import { readToday } from '@/lib/today/read'
import { Live } from '@/components/Live'
import { Stamp } from '@/components/Stamp'
import { NotDone, TodayView } from '@/components/today/TodayView'
import styles from '@/components/today/today.module.css'

/*
 * Q1: what needs me this morning. Brief §2.1.
 *
 * The page reads (lib/today/read.ts), the model decides (lib/today/model.ts,
 * every rule tested), and components/today/TodayView.tsx draws. Rebuilt
 * 22 Sep 2026, checkpoints 1 and 2:
 *   groups 3 and 4 read lib/expiries, the ONE source of expiring things
 *   (/ops/expiries reads it in C5), and say they are partial;
 *   group 5 is the plain read-only list from the gated ledger (lib/gates.ts).
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TodayPage({ searchParams }: {
  searchParams: Promise<{ ensaios?: string }>
}) {
  // The frame is the group's layout; this page renders its <main> only. The
  // gate runs here as well as there — see src/app/(operator)/layout.tsx.
  await requireOperator()
  /*
   * 🔒 OFF BY DEFAULT. A rehearsal is real work on real rows, and it is not
   * this business's work: it does not belong in what the screen reports.
   */
  const includeRehearsals = (await searchParams).ensaios === '1'
  const today = await readToday(new Date(), includeRehearsals)

  return (
    <Live serverNow={Date.parse(today.readAt)}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Today</h1>
          <NotDone />
          <span className={styles.stampSlot}><Stamp serverAt={today.readAt} /></span>
        </header>
        <TodayView model={today.model} queue={today.queue} anomalies={today.anomalies} windowDays={ANOMALY_WINDOW_DAYS} now={Date.parse(today.readAt)} />
      </div>
    </Live>
  )
}
