import { randomUUID } from 'node:crypto'
import { TRIAGE, SAVE_REFUSALS } from '@/lib/matching/screen-copy'
import { say, type Refusal } from '@/lib/refusals'
import type { TriageScreen } from '@/lib/matching/triage-read'
import type { TriageGroup } from '@/lib/matching/triage'
import { pickForListingAction } from '@/lib/matching/triage-actions'
import { SURFACE } from '@/lib/segmentation/surface'
import { Submit } from './Submit'
import styles from './listings.module.css'

/**
 * The triage floor (/listings/[id]/triage), drawn. Checkpoint 2, 22 Sep 2026.
 *
 *   🔒 EACH PICK FORM CARRIES ITS OWN ID, minted HERE when it is drawn: the same
 *      form sent twice is one pick (0057, listing_matches_pkey).
 *   🔒 WHO DECIDES is typed: the person at the agency, never the operator.
 *   🔒 A FAILED READ OF THE PICKS OR THE REQUIREMENTS OFFERS NO PICKS: without
 *      them the list could show a chosen contact as open, or a rankable one here.
 */
const muted = { color: SURFACE.page.muted }
const field = { ...SURFACE.page }
const euro = (n: number) => `€${n.toLocaleString('pt-PT')}`

function label(g: TriageGroup): string {
  switch (g.kind) {
    case 'batch': return TRIAGE.groupBatch(g.label)
    case 'year': return TRIAGE.groupYear(g.label)
    case 'area': return TRIAGE.groupArea(g.label)
    case 'rest': return TRIAGE.groupRest
  }
}

export function TriageView({ id, screen, guardado, jaGuardado, refusal, locale }: {
  id: string; screen: TriageScreen; guardado?: string; jaGuardado?: string
  /** what the last save refused, as a KEY, and the agency's locale to say it in */
  refusal?: Refusal | null; locale?: string | null
}) {
  const failed = Object.entries(screen.failures)
  const l = screen.listing
  const canPick = !screen.failures.picks && !screen.failures.requirements
  const left = screen.total - screen.chosen

  return (
    <main className={styles.page} style={{ ...SURFACE.page }}>
      <div className={styles.inner}>
        <a className={styles.back} href={`/listings/${id}`}>{TRIAGE.back}</a>
        <header className={styles.head}>
          <h1 className={styles.title}>{TRIAGE.title}</h1>
          {l && <p className={styles.sub}>{[l.reference, l.area, l.price === null ? null : euro(l.price)].filter(Boolean).join(' · ')}</p>}
          <p className={styles.intro} style={muted}>{TRIAGE.intro} {TRIAGE.what}</p>
        </header>

        {failed.length > 0 && (
          <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>
            {l ? TRIAGE.readFailed : TRIAGE.listingUnread}
            <code className={styles.detail}>{failed.map(([k, v]) => `${k}: ${v}`).join('\n')}</code>
          </p>
        )}
        {refusal && <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>{say(SAVE_REFUSALS, locale, refusal)}</p>}
        {guardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{TRIAGE.saved}</p>}
        {jaGuardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{TRIAGE.alreadySaved}</p>}

        {l && l.status !== 'available' && <p className={styles.banner} style={{ ...SURFACE.note }}>{TRIAGE.notAvailable}</p>}
        {l && canPick && screen.chosen > 0 && (
          <p className={styles.line} style={muted}>{screen.chosen === 1 ? TRIAGE.chosenSoFarOne : TRIAGE.chosenSoFarMany(screen.chosen)}</p>
        )}
        {l && canPick && screen.total === 0 && <p className={styles.line}>{TRIAGE.emptyList}</p>}
        {l && canPick && screen.total > 0 && left === 0 && <p className={styles.line}>{TRIAGE.noneLeft}</p>}

        {l && canPick && screen.groups.map((g) => (
          <section key={g.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>{label(g)}</h2>
            {/* The n=1 rule: a count of one never reads as "1 contactos". */}
            <p className={styles.line} style={muted}>{g.contacts.length === 1 ? TRIAGE.countOne : TRIAGE.countMany(g.contacts.length)}</p>
            {g.contacts.map((c) => (
              <details key={c.leadId} className={styles.contact}>
                <summary>
                  {c.name ?? TRIAGE.nameless}
                  {c.alreadyChosen && <span className={styles.tag}>{TRIAGE.chosenAlready}</span>}
                </summary>
                {!c.alreadyChosen && (
                  <form action={pickForListingAction} className={styles.form}>
                    <input type="hidden" name="listingId" value={id} />
                    <input type="hidden" name="leadId" value={c.leadId} />
                    <input type="hidden" name="pickId" value={randomUUID()} />
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>{TRIAGE.whoDecides}</span>
                      <span className={styles.hint} style={muted}>{TRIAGE.whoDecidesNote}</span>
                      <input name="declaredBy" autoComplete="off" required className={styles.input} style={field} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>{TRIAGE.why}</span>
                      <span className={styles.hint} style={muted}>{TRIAGE.whyNote} {TRIAGE.whyHelps}</span>
                      <input name="reason" autoComplete="off" className={styles.input} style={field} />
                    </label>
                    <div className={styles.actions}><Submit>{TRIAGE.pick}</Submit></div>
                  </form>
                )}
              </details>
            ))}
          </section>
        ))}
      </div>
    </main>
  )
}
