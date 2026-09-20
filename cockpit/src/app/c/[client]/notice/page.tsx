import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { agencyFacts } from '@/lib/publication/facts-store'
import { allAdvertisingPolicy } from '@/lib/publication/policy-store'
import { standingClearances } from '@/lib/publication/clearances-store'
import { recheckClearances, type ClearanceRow, type LapseCause } from '@/lib/publication/recheck'
import { NOTICE } from '@/lib/matching/screen-copy'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './notice.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE DEIXOU DE ESTAR EM ORDEM — and recheckClearances' first caller.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The re-check engine has been complete since it was written and has never run
 * once, because `ClearanceRow[]` had no source. 0039 gave it one on
 * 20 September 2026 and this screen is what asks it.
 *
 * 🔴 WHAT THIS SCREEN NEVER SAYS. We prepare advertisements; the agency
 * publishes them, in the agency's own channels, and only the agency can take
 * one down. So no verb here claims we acted — not removed, not corrected, not
 * withdrawn, not republished — and tests/publication-notice.test.ts fails on
 * any of them. `notice_sent_at` records THAT THE AGENCY WAS TOLD and nothing
 * more, which is the rule written on the column in 0039 because it is the one
 * most likely to soften now that there is somewhere to write it.
 *
 * 🔒 AND AN EMPTY LIST IS NOT A CLEAN BILL. `notCheckedFor` is rendered, not
 * footnoted: a run given no policy rows would otherwise report every clearance
 * as unconfirmable, and a run that checked nothing would look identical to a
 * run that found nothing.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CAUSE: Record<LapseCause, string> = {
  certificate_expired: NOTICE.causeExpired,
  registration_revoked: NOTICE.causeRevoked,
  requirement_arrived: NOTICE.causeArrived,
  requirement_unresolvable: NOTICE.causeUnresolvable,
}

export default async function NoticePage({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const [standing, policy, agency] = await Promise.all([
    standingClearances(clientId),
    allAdvertisingPolicy(),
    agencyFacts(clientId),
  ])

  const rows: ClearanceRow[] = standing.map((c) => ({
    clearanceId: c.id,
    listingId: c.listingId,
    // The reference is looked up by the caller in a later pass; the re-check
    // itself never needs it and a null here is a null, not a blank.
    reference: null,
    satisfied: c.satisfied,
    country: c.country,
    region: c.region,
    decidedAt: c.decidedAt,
    noticeSentAt: c.noticeSentAt,
  }))

  /*
   * 🔒 BOTH INPUTS SUPPLIED, DELIBERATELY. recheck.ts distinguishes absent from
   * empty: `undefined` means "we were not asked to check this" and `[]` means
   * "we were asked and there are no rows". Passing them makes `notCheckedFor`
   * empty and the findings real — and if either read had failed, the honest
   * thing is for that check not to run rather than for its absence to become a
   * page of findings.
   */
  const r = recheckClearances(rows, { policy, agencyFacts: agency })

  /*
   * 🔴 NOTHING CHECKED IS NOT NOTHING FOUND, and the two had the same sentence
   * until this screen was rendered for the first time. With no clearance
   * recorded the re-check examines zero rows and reports zero problems —
   * and "nenhum certificado expirou" then reads as a clean bill for a check
   * that never ran, on the screen whose whole argument is that an empty list
   * is not a guarantee.
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
