import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { getBatch } from '@/lib/import/store'
import { TIER_LABEL, TIER_MEANS, type Tier } from '@/lib/import/types'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from '../import.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE BATCH — what it loaded, what it refused, and what a revert did NOT undo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §10.
 *
 * 🔴 THE REVERT REPORT LEADS WITH WHAT WAS NOT UNDONE. The failure mode here is
 * a success line over a partly-undone import: "1 199 removed" reads as finished,
 * and the seventeen kept because somebody has since talked to them are the part
 * that still needs a decision.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Retained = { leadId: string; name?: string | null; reason?: string }

export default async function OneBatch({
  params,
}: {
  params: Promise<{ client: string; batch: string }>
}) {
  await requireOperator()
  const { client: clientId, batch: batchId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const b = await getBatch(batchId)
  // 🔒 A batch belonging to another client is a 404, not a render. §1.8.
  if (!b || b.client_id !== clientId) notFound()

  const r = b.report
  const tier = (b.tier ?? r?.tier) as Tier | null
  const revert = (r as { revert?: { removed?: number; retained?: Retained[] } })?.revert

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{b.filename}</h1>
          <p className={styles.sub}>
            {client.name} · loaded {new Date(b.created_at).toLocaleString('en-GB', { dateStyle: 'medium' })}
            {b.uploaded_by && <> by {b.uploaded_by}</>}
          </p>
        </div>
        <StateChip meaning={b.status === 'committed' ? 'through' : b.status === 'reverted' ? 'held' : 'grey'}>
          {b.status}
        </StateChip>
      </header>

      {/* 🔴 The revert report, FIRST, and leading with what was kept. */}
      {b.status === 'reverted' && (
        <StateSurface meaning="held" className={styles.revert}>
          <b>
            {revert?.retained?.length
              ? `${revert.retained.length} lead${revert.retained.length === 1 ? ' was' : 's were'} kept.`
              : 'Everything this import created was removed.'}
          </b>{' '}
          {revert?.removed !== undefined && <>{revert.removed} removed. </>}
          <b>No message and no event was deleted</b> — a revert never destroys evidence.
          {revert?.retained?.length ? (
            <span className={styles.retained}>
              These were kept because they have been talked to since. Removing them would leave their conversations
              with the subject erased.
              {revert.retained.map((x) => (
                <span className={styles.retainedRow} key={x.leadId}>
                  {x.name ?? x.leadId} — {x.reason ?? 'has been talked to since the import'}
                </span>
              ))}
            </span>
          ) : null}
        </StateSurface>
      )}

      {b.status === 'staged' && (
        <StateSurface meaning="grey" className={styles.revert}>
          <b>Nothing has been written.</b> This batch was read and checked, and no lead exists because of it.
          Abandoning it leaves nothing behind.
        </StateSurface>
      )}

      <section className={styles.counts}>
        <div className={styles.c}>
          <span className={styles.cn}>{r?.received ?? 0}</span>
          <span className={styles.cl}>rows read</span>
        </div>
        <div className={styles.c}>
          <span className={styles.cn}>{r?.accepted ?? 0}</span>
          <span className={styles.cl}>accepted</span>
        </div>
        <div className={styles.c}>
          <span className={styles.cn}>{r?.rejected?.length ?? 0}</span>
          <span className={styles.cl}>rejected</span>
        </div>
        <div className={styles.c}>
          <span className={styles.cn}>{(r?.duplicatesInFile?.length ?? 0) + (r?.duplicatesAgainstExisting?.length ?? 0)}</span>
          <span className={styles.cl}>duplicates</span>
        </div>
      </section>

      {tier && (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>What this data supports</h2>
          </header>
          <StateSurface meaning="grey" className={styles.empty}>
            <b>{TIER_LABEL[tier]}</b> — {TIER_MEANS[tier]}
          </StateSurface>
        </section>
      )}

      {/* 🔒 Every rejected row carries its reason: a rejected row that does not
          say why is a row nobody can fix. */}
      {r?.rejected?.length ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>Rejected</h2>
            <span className={styles.answers}>each with the reason, so each one can be fixed</span>
          </header>
          <div className={styles.rows}>
            {r.rejected.map((x) => (
              <div className={styles.reject} key={`${x.row}-${x.reason}`}>
                <span className={styles.line}>row {x.row}</span>
                <span className={styles.reason}>{x.reason}</span>
                <span className={styles.raw}>{Object.values(x.raw ?? {}).filter(Boolean).slice(0, 4).join(' · ')}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 🔒 Duplicates as MERGED WITH WHAT, never silently collapsed. */}
      {(r?.duplicatesInFile?.length ?? 0) + (r?.duplicatesAgainstExisting?.length ?? 0) > 0 && (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2>Merged</h2>
            <span className={styles.answers}>what each one was merged with — nothing collapses silently</span>
          </header>
          <div className={styles.rows}>
            {[...(r.duplicatesInFile ?? []), ...(r.duplicatesAgainstExisting ?? [])].map((d, i) => (
              <div className={styles.reject} key={`${d.row}-${d.value}-${i}`}>
                <span className={styles.line}>row {d.row}</span>
                <span className={styles.reason}>
                  same {d.on} as {d.matches === 'existing lead' ? 'a contact already held' : `${d.matches} other row(s) in this file`}
                </span>
                <span className={styles.raw}>{d.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
