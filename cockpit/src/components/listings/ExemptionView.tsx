import { randomUUID } from 'node:crypto'
import { EXEMPTION, SAVE_REFUSALS } from '@/lib/matching/screen-copy'
import { say, type Refusal } from '@/lib/refusals'
import type { ExemptionScreen } from '@/lib/publication/exemption-read'
import { declareExemptionAction } from '@/lib/publication/exemption-actions'
import { sittingDate } from '@/lib/matching/calibrate-reference'
import { SURFACE } from '@/lib/segmentation/surface'
import { Submit } from './Submit'
import styles from './listings.module.css'

/**
 * The exemption (/listings/[id]/exemption), drawn. Checkpoint 2, 22 Sep 2026.
 * Written to read like the segmentation declaration, on purpose: the same two
 * fields, the same hint under "who is saying this".
 *
 *   🔒 THE FORM CARRIES ITS OWN ID, minted HERE: the same form sent twice is one
 *      act (0057, exemption_records_pkey).
 *   🔒 NO FORM on a failed read, on a rated property, or when the policy names
 *      no single exemptible requirement, and each says why in its own words.
 */
const muted = { color: SURFACE.page.muted }
const field = { ...SURFACE.page }

export function ExemptionView({ id, screen, guardado, jaGuardado, refusal, locale }: {
  id: string; screen: ExemptionScreen; guardado?: string; jaGuardado?: string
  /** what the last save refused, as a KEY, and the agency's locale to say it in */
  refusal?: Refusal | null; locale?: string | null
}) {
  const failed = Object.entries(screen.failures)
  const l = screen.listing
  const formable = l && failed.length === 0 && !screen.rated && screen.requirementId

  return (
    <main className={styles.page} style={{ ...SURFACE.page }}>
      <div className={styles.inner}>
        <a className={styles.back} href={`/listings/${id}`}>{EXEMPTION.back}</a>
        <header className={styles.head}>
          <h1 className={styles.title}>{EXEMPTION.title}</h1>
          {l && <p className={styles.sub}>{[l.reference, l.area].filter(Boolean).join(' · ')}</p>}
          <p className={styles.intro} style={muted}>{EXEMPTION.intro}</p>
          <p className={styles.line} style={muted}>{EXEMPTION.whatItDoesNot}</p>
        </header>

        {failed.length > 0 && (
          <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>
            {l ? EXEMPTION.readFailed : EXEMPTION.listingUnread}
            <code className={styles.detail}>{failed.map(([k, v]) => `${k}: ${v}`).join('\n')}</code>
          </p>
        )}
        {refusal && <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>{say(SAVE_REFUSALS, locale, refusal)}</p>}
        {guardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{EXEMPTION.saved}</p>}
        {jaGuardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{EXEMPTION.alreadySaved}</p>}

        {l && failed.length === 0 && (
          <>
            {screen.rated && <p className={styles.line}>{EXEMPTION.already}</p>}
            {!screen.rated && screen.current && (
              <div className={styles.record}>
                <p>{EXEMPTION.current(screen.current.declaredBy, sittingDate(screen.current.at))}</p>
                <p><strong>{EXEMPTION.currentBasis}</strong> {screen.current.basis}</p>
              </div>
            )}
            {!screen.rated && !screen.current && <p className={styles.line} style={muted}>{EXEMPTION.nothingYet}</p>}
            {!screen.rated && screen.ambiguous && <p className={styles.banner} style={{ ...SURFACE.note }}>{EXEMPTION.ambiguous}</p>}
            {!screen.rated && !screen.ambiguous && !screen.requirementId && <p className={styles.line}>{EXEMPTION.noRequirement}</p>}
          </>
        )}

        {formable && (
          <form action={declareExemptionAction} className={styles.form} style={{ padding: 0 }}>
            <input type="hidden" name="listingId" value={id} />
            <input type="hidden" name="requirementId" value={screen.requirementId!} />
            <input type="hidden" name="exemptionId" value={randomUUID()} />
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{EXEMPTION.basis}</span>
              <span className={styles.hint} style={muted}>{EXEMPTION.basisHint}</span>
              <input name="basis" autoComplete="off" required className={styles.input} style={field} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{EXEMPTION.whoIsDeclaring}</span>
              <span className={styles.hint} style={muted}>{EXEMPTION.whoIsDeclaringHint}</span>
              <input name="declaredBy" autoComplete="off" required className={styles.input} style={field} />
            </label>
            <div className={styles.actions}><Submit>{EXEMPTION.save}</Submit></div>
          </form>
        )}
      </div>
    </main>
  )
}
