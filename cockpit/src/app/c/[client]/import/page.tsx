import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { listBatches } from '@/lib/import/store'
import { TIER_LABEL, TIER_MEANS, type Tier } from '@/lib/import/types'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './import.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORT — Q25: what did we load, from which file, and can I undo it?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §10.
 *
 * 🔴 AN IMPORT IS THE MOMENT A LEGAL CLAIM ABOUT HUNDREDS OF PEOPLE IS CREATED.
 * Everything downstream — the declaration, the gate, the forecast — is
 * reasoning over what this flow wrote. It is the one screen in the cockpit
 * where a mistake costs something rather than displays wrongly.
 *
 * 🔒 THE RAIL SHOWS ALL FIVE STEPS AND MARKS WHERE THE WRITE HAPPENS. The
 * operator should not have to know from the code that steps one to three can be
 * abandoned and leave nothing behind.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** 🔒 Three states, each in its own words rather than as a status badge. */
const STATUS_MEANS: Record<string, { word: string; means: string; tone: 'grey' | 'through' | 'held' }> = {
  staged: {
    word: 'staged',
    means: 'read and checked, and nothing has been written to leads. Abandoning it now leaves nothing behind.',
    tone: 'grey',
  },
  committed: {
    word: 'committed',
    means: 'the leads exist, and a claim about these people is on the record.',
    tone: 'through',
  },
  reverted: {
    word: 'reverted',
    means: 'the leads it created were removed and the claim it made no longer stands. Both events are in the ledger.',
    tone: 'held',
  },
}

const STEPS = [
  { n: 1, name: 'Upload', note: 'the file is read, not stored as data about anybody' },
  { n: 2, name: 'Map columns', note: 'their column → our field → why' },
  { n: 3, name: 'Plan', note: 'what would be accepted, rejected and merged' },
  { n: 4, name: 'Commit', note: 'writes to leads here', writes: true },
  { n: 5, name: 'Revert', note: 'removes leads, and never a message or an event' },
]

export default async function ImportBatches({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let batches: Awaited<ReturnType<typeof listBatches>> | null = null
  let threw = ''
  try {
    // 🔒 Scoped. An unscoped call here renders another agency's filenames.
    batches = await listBatches(50, clientId)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Import</h1>
          <p className={styles.sub}>
            {client.name} · what was loaded, from which file, and whether it can be undone.{' '}
            <b>An import is the moment a claim about hundreds of people is created.</b>
          </p>
        </div>
      </header>

      {/* 🔒 The rail, with the write marked. */}
      <section className={styles.rail}>
        {STEPS.map((s) => (
          <div className={`${styles.step} ${s.writes ? styles.writes : ''}`} key={s.n}>
            <span className={styles.stepN}>{s.n}</span>
            <span className={styles.stepName}>{s.name}</span>
            <span className={styles.stepNote}>{s.note}</span>
          </div>
        ))}
        <p className={styles.railNote}>
          Steps one to three can be abandoned and leave nothing behind. <b>Nothing reaches leads until step four.</b>
        </p>
      </section>

      {batches === null ? (
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'the import batches', threw }).sentence}
        </StateSurface>
      ) : batches.length === 0 ? (
        <StateSurface meaning="grey" className={styles.empty}>
          {whyEmpty({ state: 'never', owner: 'this client', thing: 'a contact list loaded for them' }).sentence} No
          claim has been made about anybody on their behalf.
        </StateSurface>
      ) : (
        <div className={styles.rows}>
          {batches.map((b) => {
            const st = STATUS_MEANS[b.status] ?? { word: b.status, means: '', tone: 'grey' as const }
            const tier = (b.tier ?? b.report?.tier) as Tier | null
            return (
              <Link className={styles.batch} href={`/c/${clientId}/import/${b.id}`} key={b.id}>
                <span className={styles.top}>
                  <span className={styles.file}>{b.filename}</span>
                  <StateChip meaning={st.tone}>{st.word}</StateChip>
                </span>
                <span className={styles.means}>{st.means}</span>
                <span className={styles.figures}>
                  {b.report?.accepted ?? 0} accepted of {b.report?.received ?? 0} read
                  {b.report?.rejected?.length ? ` · ${b.report.rejected.length} rejected` : ''}
                  {' · '}
                  {new Date(b.created_at).toLocaleDateString('en-GB')}
                </span>
                {tier && (
                  /* 🔒 The tier with what it MEANS, never as a bare label: it
                     decides what may honestly be sold on top of this data. */
                  <span className={styles.tier}>
                    <b>{TIER_LABEL[tier]}</b> — {TIER_MEANS[tier]}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          <b>No column may be mapped to consent.</b> A spreadsheet cell is not evidence that somebody agreed to be
          contacted, and recording one as consent is the error the ledger&rsquo;s <i>quarantined</i> kind exists to
          correct. There is no such target to choose.
        </p>
        <p>
          <b>A revert never destroys evidence.</b> It removes leads and never deletes a message or an event. Deleting
          a lead does not delete its messages — it nulls the link, leaving a conversation whose subject has been
          erased — so any lead that has since been talked to is refused rather than removed, and named.
        </p>
        <p>Nothing is deduplicated silently. What was merged, and with what, is shown.</p>
        <p>No import without a client: a contact list has to belong to somebody.</p>
      </div>
    </>
  )
}
