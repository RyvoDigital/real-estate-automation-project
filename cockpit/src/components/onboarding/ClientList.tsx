import { StateChip } from '@/components/state-chip'
import type { Checklist } from '@/lib/onboarding-checklist'
import styles from './onboarding.module.css'

/*
 * Every client and where its onboarding stands (brief §2.8). The deploy gate's
 * test clients are already left out by the read (config.gate_only).
 *
 *   🔴 "onboarded" only when the model says so; otherwise the count of what is
 *      outstanding, never a softer word.
 */

export type ListItem = { id: string; name: string; rehearsal: boolean; createdOn: string; checklist: Checklist }

export function ClientList({ items, failure }: { items: ListItem[] | null; failure: string | null }) {
  return (
    <section className={styles.panel} aria-label="Clients">
      <div className={styles.panelHead}>
        <h2>Clients</h2>
        <span>where each one’s onboarding stands</span>
      </div>
      {failure ? <p className={styles.empty}><StateChip meaning="red">not read</StateChip> {failure}</p>
        : !items || items.length === 0 ? <p className={styles.empty}>No clients yet. The first one is created here.</p>
        : (
          <ul className={styles.rows}>
            {items.map((c) => {
              const out = c.checklist.outstanding.length
              const unknown = c.checklist.unknown.length
              return (
                <li key={c.id}>
                  <a className={styles.row} href={`/onboarding?client=${c.id}`}>
                    <span className={styles.rowName}>
                      {c.name}
                      <small>{c.rehearsal ? 'rehearsal · ' : ''}created {c.createdOn}</small>
                    </span>
                    {/* Both counts, always: an unknown step hidden behind "2 outstanding" would
                        understate what is left (found in the real render, 22 Sep 2026). */}
                    {c.checklist.onboarded ? <StateChip meaning="through">onboarded</StateChip>
                      : <StateChip meaning="grey">{[out ? `${out} outstanding` : '', unknown ? `${unknown} not known` : ''].filter(Boolean).join(' · ')}</StateChip>}
                  </a>
                </li>
              )
            })}
          </ul>
        )}
    </section>
  )
}
