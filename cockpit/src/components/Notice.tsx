import { recheckClearances, type ClearanceRow, type LapseCause } from '@/lib/publication/recheck'
import type { AgencyFact } from '@/lib/publication/facts-store'
import type { PolicyRow } from '@/lib/publication/requirements'
import { NOTICE } from '@/lib/matching/screen-copy'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './Notice.module.css'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE DEIXOU DE ESTAR EM ORDEM — rendered once, shown in two frames.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔒 THE OPERATOR'S VIEW AND THE AGENCY'S VIEW ARE THE SAME COMPONENT.
 *
 * /c/<client>/notice and /p/<client>/notice both render this. The frame is
 * what differs — presented mode drops the switcher, the counts, the way up and
 * every other screen — and the page does not differ at all.
 *
 * That is deliberate and it is the register's rule applied to a screen rather
 * than to a fact: two renders of one subject drift, and the cross-screen sweep
 * found 22 disagreements produced exactly that way. Here the risk is sharper
 * than usual, because the drift would be between what an operator reads
 * beforehand and what an agency is shown in the room.
 *
 * 🔴 WHAT IT NEVER SAYS. We prepare advertisements; the agency publishes them,
 * in the agency's own channels, and only the agency can take one down. No verb
 * here claims we acted — not removed, not corrected, not withdrawn, not
 * republished — and tests/publication-notice.test.ts fails on any of them.
 */

const CAUSE: Record<LapseCause, string> = {
  certificate_expired: NOTICE.causeExpired,
  registration_revoked: NOTICE.causeRevoked,
  requirement_arrived: NOTICE.causeArrived,
  requirement_unresolvable: NOTICE.causeUnresolvable,
}

export function Notice({
  clearances,
  policy,
  agency,
}: {
  clearances: ClearanceRow[]
  policy: PolicyRow[]
  agency: AgencyFact[]
}) {
  /*
   * 🔒 BOTH INPUTS SUPPLIED, DELIBERATELY. recheck.ts distinguishes absent from
   * empty: `undefined` means "we were not asked to check this" and `[]` means
   * "we were asked and there are no rows". Collapsing the two is how a database
   * read that came back empty becomes a page of findings.
   */
  const r = recheckClearances(clearances, { policy, agencyFacts: agency })

  /*
   * 🔴 NOTHING CHECKED IS NOT NOTHING FOUND, and the two had the same sentence
   * until this screen was rendered for the first time. With no clearance
   * recorded the re-check examines zero rows and reports zero problems — and
   * "nenhum certificado expirou" then reads as a clean bill for a check that
   * never ran, on the page whose whole argument is that an empty list is not a
   * guarantee.
   */
  const nothingWasChecked = r.checked === 0

  return (
    <>

      <h1 className={styles.title}>{NOTICE.title}</h1>
      <p className={styles.intro}>{NOTICE.intro}</p>
      <p className={styles.canDo}>{NOTICE.whatWeCanDo}</p>

      {/* ── already lapsed ──────────────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>{NOTICE.lapsedHeading}</h2>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {r.checked} verificad{r.checked === 1 ? 'a' : 'as'}
          </span>
        </div>
        {nothingWasChecked ? (
          <p className={styles.none}>{NOTICE.nothingToCheck}</p>
        ) : r.lapsed.length === 0 ? (
          <p className={styles.none}>{NOTICE.nothing}</p>
        ) : (
          <>
            <p className={styles.lead}>
              {r.lapsed.length === 1 ? NOTICE.lapsedOne : NOTICE.lapsedMany(r.lapsed.length)}
            </p>
            {r.lapsed.map((l) => (
              <div className={styles.row} key={l.clearanceId}>
                <span>
                  <span className={styles.ref}>{l.reference ?? l.listingId}</span>
                  {/* 🔒 EVERY cause, never the first one found. An agency told
                      only that the certificate lapsed buys a new certificate,
                      and the licence is still not valid. */}
                  {l.causes.map((c) => (
                    <span className={styles.cause} key={c}>
                      {CAUSE[c]}
                    </span>
                  ))}
                  <span className={styles.since}>
                    {/* ⚠️ Null is not zero. A revocation has no date we hold. */}
                    {l.since && l.daysAgo !== null
                      ? NOTICE.expiredOn(l.since.slice(0, 10), l.daysAgo)
                      : NOTICE.sinceUnknown}
                  </span>
                </span>
                <span className={styles.right}>
                  {l.noticeSentAt ? (
                    <StateChip meaning="through">{NOTICE.toldOn(l.noticeSentAt.slice(0, 10))}</StateChip>
                  ) : (
                    <StateChip meaning="grey">{NOTICE.notToldYet}</StateChip>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </section>

      {/* ── expiring soon ───────────────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>{NOTICE.expiringHeading}</h2>
        </div>
        {nothingWasChecked ? (
          <p className={styles.none}>{NOTICE.nothingToCheck}</p>
        ) : r.expiringSoon.length === 0 ? (
          <p className={styles.none}>{NOTICE.nothing}</p>
        ) : (
          <>
            <p className={styles.lead}>
              {r.expiringSoon.length === 1
                ? NOTICE.expiringOne(r.warnWithinDays)
                : NOTICE.expiringMany(r.expiringSoon.length, r.warnWithinDays)}
            </p>
            {r.expiringSoon.map((e) => (
              <div className={styles.row} key={e.clearanceId}>
                <span>
                  <span className={styles.ref}>{e.reference ?? e.listingId}</span>
                  <span className={styles.cause}>
                    {/* Zero whole days means it expires TODAY and is valid
                        today — the gate agrees, and "hoje" is what a person
                        says where a number would say "daqui a 0 dias". */}
                    {e.daysLeft === 0
                      ? NOTICE.expiresToday(e.expiresOn.slice(0, 10))
                      : e.daysLeft === 1
                        ? NOTICE.expiresTomorrow(e.expiresOn.slice(0, 10))
                        : NOTICE.expiresOn(e.expiresOn.slice(0, 10), e.daysLeft)}
                  </span>
                </span>
                <span className={styles.right} />
              </div>
            ))}
          </>
        )}
      </section>

      {/* ── licences to confirm ─────────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>{NOTICE.confirmHeading}</h2>
        </div>
        <p className={styles.intro} style={{ marginTop: 0, marginBottom: 12, fontSize: 14.5 }}>
          {NOTICE.confirmIntro}
        </p>
        {r.toConfirm.length === 0 ? (
          <p className={styles.none}>{NOTICE.confirmNothing}</p>
        ) : (
          r.toConfirm.map((t) => (
            <div className={styles.row} key={t.requirementId + t.number}>
              <span>
                <span className={styles.ref}>{t.number}</span>
                <span className={styles.cause}>
                  {/* ⚠️ Never checked and checked-a-while-ago are different
                      sentences, because null is not a large number. */}
                  {t.daysSinceChecked === null
                    ? NOTICE.confirmNever(t.number)
                    : NOTICE.confirmStale(t.number, t.daysSinceChecked)}
                </span>
                <span className={styles.since}>
                  {t.affects === 1 ? NOTICE.confirmAffectsOne : NOTICE.confirmAffectsMany(t.affects)}
                </span>
              </span>
              <span className={styles.right} />
            </div>
          ))
        )}
      </section>

      {/* ── what this run could not look at ─────────────────────────────── */}
      {r.notCheckedFor.length > 0 && (
        <StateSurface meaning="grey" className={styles.notChecked}>
          <h2>{NOTICE.notCheckedHeading}</h2>
          <p style={{ margin: 0 }}>{NOTICE.notChecked}</p>
        </StateSurface>
      )}

      <div className={styles.absent}>
        <h2>O que este ecrã não faz</h2>
        <p>Não retiramos nada de lado nenhum — a publicação é da agência, nos canais da agência.</p>
        <p>Registar que a agência foi avisada é registar um aviso, e nada mais do que isso.</p>
        <p>Não consultamos o IMPIC. O que temos é o número que a agência nos deu.</p>
        <p>Uma lista vazia aqui não é uma garantia: é o que esta verificação viu.</p>
      </div>
    </>
  )
}
