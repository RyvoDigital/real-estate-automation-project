import { MATCHES, STATUS_WORD } from '@/lib/matching/screen-copy'
import type { MatchesScreen } from '@/lib/matching/screen-read'
import { SURFACE } from '@/lib/segmentation/surface'
import styles from './listings.module.css'

/**
 * Who a listing serves (/listings/[id]), drawn. Checkpoint 2, 22 Sep 2026.
 * Read-only: it writes nothing and triggers no matching run.
 *
 *   🔒 A FAILED READ IS SAID, and then nothing it would have decided is claimed:
 *      not "nobody", not "not calibrated".
 *   🔒 The engine's matches and the agency's picks never share a list (0025).
 */
const muted = { color: SURFACE.page.muted }
const euro = (n: number) => `€${n.toLocaleString('pt-PT')}`

export function ListingDetailView({ id, screen }: { id: string; screen: MatchesScreen }) {
  const failed = Object.entries(screen.failures)
  const l = screen.listing
  const computed = screen.matches.filter((m) => m.origin === 'computed')
  const chosen = screen.matches.filter((m) => m.origin === 'agent')

  return (
    <main className={styles.page} style={{ ...SURFACE.page }}>
      <div className={styles.inner}>
        <a className={styles.back} href="/listings">{MATCHES.back}</a>
        <header className={styles.head}>
          <h1 className={styles.title}>{MATCHES.title}</h1>
          {l && <p className={styles.sub}>{[l.reference, l.area, l.price === null ? null : euro(l.price)].filter(Boolean).join(' · ')}</p>}
          {l && <p className={styles.line} style={muted}>{STATUS_WORD[l.status] ?? l.status}</p>}
        </header>

        {failed.length > 0 && (
          <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>
            {l ? MATCHES.readFailed : MATCHES.listingUnread}
            <code className={styles.detail}>{failed.map(([k, v]) => `${k}: ${v}`).join('\n')}</code>
          </p>
        )}

        {l && (
          <>
            {l.status !== 'available' && <p className={styles.banner} style={{ ...SURFACE.note }}>{MATCHES.notAvailable}</p>}

            {screen.missingThresholds.length > 0 && (
              <div className={styles.record} style={{ ...SURFACE.note }}>
                <p>{MATCHES.notCalibrated}</p>
                {screen.clientId && <a className={styles.link} href={`/calibrate/${screen.clientId}`}>{MATCHES.notCalibratedAction}</a>}
              </div>
            )}

            {/* "Nobody" only when the matches AND the config were read: an unread list is not an empty one. */}
            {!screen.failures.matches && !screen.failures.config && screen.matches.length === 0 && screen.missingThresholds.length === 0 && (
              <p className={styles.line}>{MATCHES.none}</p>
            )}

            {/* The triage floor is reachable whatever the run did: it needs no thresholds. */}
            <a className={styles.link} href={`/listings/${id}/triage`}>{MATCHES.goToTriage}</a>

            {computed.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>{MATCHES.computedHeading}</h2>
                <ul className={styles.people}>
                  {computed.map((m) => (
                    <li key={m.leadId} className={styles.person}>
                      <span className={styles.personName}>{m.name ?? ''}</span>
                      <span className={styles.personLine} style={muted}>
                        {m.strength ? MATCHES.strengthWord[m.strength] ?? '' : ''}
                        {m.monthsSinceContact === null ? ` · ${MATCHES.neverContacted}`
                          : m.monthsSinceContact === 1 ? ` · ${MATCHES.lastSpokeOne}`
                          : m.monthsSinceContact > 1 ? ` · ${MATCHES.lastSpokeMany(m.monthsSinceContact)}` : ''}
                      </span>
                      {m.filterWouldFind === false && <span className={styles.personLine}>{MATCHES.aFilterWouldMiss}</span>}
                      {m.reasons.length > 0 && (
                        <details className={styles.reasons}>
                          <summary>{MATCHES.engineWordsHeading}</summary>
                          <ul>{m.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {chosen.length > 0 && (
              <section className={styles.section}>
                {/* Separate from the computed block, always: a person's pick never borrows a computed match's authority. */}
                <h2 className={styles.sectionTitle}>{MATCHES.chosenHeading}</h2>
                <ul className={styles.people}>
                  {chosen.map((m) => (
                    <li key={m.leadId} className={styles.person}>
                      <span className={styles.personName}>{m.name ?? ''}</span>
                      <span className={styles.personLine} style={muted}>
                        {m.chosenReason ?? ''}{m.chosenBy ? ` (${MATCHES.chosenBy(m.chosenBy)})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
