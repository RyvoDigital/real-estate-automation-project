import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { CALIBRATE, SAVE_REFUSALS } from '@/lib/matching/screen-copy'
import { say, type Refusal } from '@/lib/refusals'
import { explainSaved } from '@/lib/matching/thresholds'
import { referenceLines, sittingDate } from '@/lib/matching/calibrate-reference'
import type { CalibrationScreen } from '@/lib/matching/calibrate-read'
import type { Answers } from '@/lib/matching/thresholds'
import { SURFACE } from '@/lib/segmentation/surface'
import { operatorName } from '@/lib/operators'
import { CalibrateForm } from './CalibrateForm'
import styles from './calibrate.module.css'

/**
 * /calibrate/[clientId], drawn (checkpoint 2, 22 Sep 2026), in The Month's
 * direction on the light surface this screen shares with /segmentation: it is
 * used with an agent sitting beside the operator.
 *
 *   🔒 A FAILED READ SAYS SO, and then says nothing about a previous sitting:
 *      never "not answered yet" on a read that did not happen.
 *   🔒 The previous sitting is REFERENCE: its date, who answered and who
 *      recorded it here, and each answer beside its field. The fields are empty.
 *   🔒 The recorder is shown by NAME (lib/operators.ts), never by email: the
 *      agency sees this screen.
 *   🔒 THE CALIBRATION ID IS MINTED HERE, per drawn form, and travels in it.
 */

const muted = { color: SURFACE.page.muted }
const euro = (n: number) => `€${n.toLocaleString('pt-PT')}`

export function CalibrateView({ clientId, screen, guardado, jaGuardado, refusal, campos }: {
  clientId: string
  screen: CalibrationScreen
  guardado?: string
  jaGuardado?: string
  /** what the last save refused, as a KEY: said here in the agency's language */
  refusal?: Refusal | null
  /** "field:why,field:why" from a server refusal */
  campos?: string
}) {
  const serverProblems = Object.fromEntries(
    (campos ?? '').split(',').map((p) => p.split(':')).filter(([f, w]) => f && w),
  ) as Partial<Record<keyof Answers | 'answeredBy', string>>
  const prev = screen.previous
  const explained = prev ? explainSaved(prev.thresholds) : null

  return (
    <main className={styles.page} style={{ ...SURFACE.page }}>
      <div className={styles.inner}>
        <Link className={styles.back} href="/calibrate">{CALIBRATE.back}</Link>
        <header className={styles.head}>
          <h1 className={styles.title}>{CALIBRATE.title}</h1>
          {screen.client && <p className={styles.agency}>{screen.client.name}</p>}
          <p className={styles.intro} style={muted}>{CALIBRATE.intro} {CALIBRATE.why}</p>
        </header>

        {screen.failure && (
          <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>
            {CALIBRATE.readFailed}
            <code className={styles.detail}>{screen.failure}</code>
          </p>
        )}
        {refusal && <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>{say(SAVE_REFUSALS, screen.client?.locale, refusal)}</p>}
        {guardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{CALIBRATE.saved}</p>}
        {jaGuardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{CALIBRATE.alreadySaved}</p>}

        {!screen.failure && !screen.client && <p className={styles.line}>{CALIBRATE.unknownClient}</p>}

        {!screen.failure && screen.client && (
          <section className={styles.summary}>
            {prev && explained ? (
              <>
                <p className={styles.summaryHead}>{CALIBRATE.lastSitting(sittingDate(prev.recordedAt), prev.answeredBy, operatorName(prev.recordedBy) ?? CALIBRATE.ourTeam)}</p>
                <p className={styles.line}>{CALIBRATE.savedSummary(euro(2_000_000), euro(explained.plainCeiling), euro(explained.statedCeiling))}</p>
                <p className={styles.line}>{explained.bedrooms ? CALIBRATE.savedBedroomsYes : CALIBRATE.savedBedroomsNo}</p>
                {explained.areas.length === 0 && <p className={styles.line}>{CALIBRATE.savedAreasNone}</p>}
              </>
            ) : (
              <p className={styles.summaryHead}>{CALIBRATE.notSavedYet}</p>
            )}
            <p className={styles.line} style={muted}>{CALIBRATE.blankEachTime}</p>
          </section>
        )}

        {screen.client && (
          <CalibrateForm
            clientId={clientId}
            calibrationId={randomUUID()}
            reference={prev ? referenceLines(prev.answers) : null}
            serverProblems={serverProblems}
          />
        )}
      </div>
    </main>
  )
}
