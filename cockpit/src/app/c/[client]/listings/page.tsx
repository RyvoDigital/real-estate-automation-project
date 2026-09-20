import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readListingsWithGate } from '@/lib/listings/read-with-gate'
import { ADVERTISABILITY_EN, ADVERTISABILITY_TONE } from '@/lib/listings/advertisability'
import { STATUS_LABEL, STATUS_MEANS, isMatchable } from '@/lib/listings/status'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './listings.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * LISTINGS — what has this agency got, and what is in play?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §5.
 *
 * 🔴 TWO COLUMNS, TWO VOCABULARIES, AND THEY MAY NEVER SHARE A WORD. What the
 * agency told us is a stored fact; what the law answers is computed. A reader
 * who has once seen the two share a word will merge them forever after, and
 * `tests/listings-vocabularies.test.ts` is what stops that being a matter of
 * care.
 *
 * 🔒 ONLY THE COMPUTED COLUMN IS STAMPED. Stamping both would make the stamp
 * meaningless: the status is what an agent said, and it does not go stale
 * because a page was left open.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Listings({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const v = await readListingsWithGate(clientId)

  if (!v) {
    return (
      <>
        <h1 className={styles.title}>Listings</h1>
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'the listings', threw: 'the read did not return' }).sentence}
        </StateSurface>
      </>
    )
  }

  const matchable = v.rows.filter((r) => isMatchable(r.listing.status)).length
  const n = v.rows.length

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Listings</h1>
          <p className={styles.sub}>
            {client.name} · what they have, and what is in play.{' '}
            <b>What the agency says and what the law says are two different columns</b>, and they move independently.
          </p>
        </div>
        <span className={styles.stamp}>
          {/* 🔒 The moment belongs to the COMPUTED column only. */}
          <span>Checked</span>
          <b>{new Date(v.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
          <span>the answer changes when the law or the documents change</span>
        </span>
      </header>

      {n === 0 ? (
        <StateSurface meaning="grey" className={styles.empty}>
          {whyEmpty({ state: 'never', owner: 'this agency', thing: 'a property' }).sentence} A listing arrives from an
          agent over WhatsApp; there is no way to create one here.
        </StateSurface>
      ) : (
        <>
          <p className={styles.count}>
            {/* 🔒 The n=1 rule: a count of one never reads as "1 properties". */}
            <b>
              {n} {n === 1 ? 'property' : 'properties'}
            </b>
            {' · '}
            {matchable === 0 ? (
              // 🔒 S1 says WHY the absence exists rather than leaving it to be
              // discovered: only available listings are matched at all.
              <>none is currently available, and only an available property is ever matched to a buyer</>
            ) : (
              <>
                {matchable} available, and only an available property is matched to a buyer
              </>
            )}
          </p>

          <div className={styles.rows}>
            {v.rows.map(({ listing, advertisability, detail }) => (
              <Link className={styles.row} href={`/c/${clientId}/listings/${listing.id}/publish`} key={listing.id}>
                <span className={styles.what}>
                  <span className={styles.ref}>{listing.reference ?? 'no reference'}</span>
                  <span className={styles.desc}>
                    {[listing.property_type, listing.area, listing.bedrooms ? `${listing.bedrooms} bed` : null]
                      .filter(Boolean)
                      .join(' · ') || 'nothing else recorded'}
                  </span>
                </span>

                {/* ── the agency's word ──────────────────────────────────── */}
                <span className={styles.col}>
                  <span className={styles.colLabel}>the agency says</span>
                  <StateChip
                    meaning={
                      listing.status === 'available'
                        ? 'through'
                        : listing.status === 'reserved' || listing.status === 'under_offer'
                          ? 'held'
                          : 'grey'
                    }
                  >
                    {STATUS_LABEL[listing.status]}
                  </StateChip>
                  <span className={styles.colWhy}>{STATUS_MEANS[listing.status]}</span>
                </span>

                {/* ── the law's word, and never the same word ────────────── */}
                <span className={styles.col}>
                  <span className={styles.colLabel}>the law says</span>
                  <StateChip meaning={ADVERTISABILITY_TONE[advertisability]}>
                    {ADVERTISABILITY_EN[advertisability]}
                  </StateChip>
                  {/* The gate's own sentence, never re-worded here. */}
                  {detail && <span className={styles.colWhy}>{detail}</span>}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          It never starts a matching run. Refreshing a page must not rewrite what a run already found — and on a
          property somebody has already been told about, that would be changing a record they acted on.
        </p>
        <p>
          <b>It asks the gate and records nothing.</b> Opening a list of forty properties must not write forty
          clearances: a clearance is a dated record that a decision was taken for a reason, not a cache of a
          screen&rsquo;s last render.
        </p>
        <p>
          No property is created or edited here, and no status is changed. A listing arrives from an agent&rsquo;s own
          message, and a form here would be a second origin with nobody attached to it.
        </p>
        <p>
          The two columns are never merged. What the agency says about a property and what the law says about
          advertising it are different questions with different answers, and one is not evidence of the other.
        </p>
      </div>
    </>
  )
}
