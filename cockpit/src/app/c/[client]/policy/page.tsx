import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { allAdvertisingPolicy, policyContext, type PolicyContext } from '@/lib/publication/policy-store'
import {
  RESOLUTION_MEANS,
  resolveRequirements,
  type PolicyRow,
  type Requirement,
} from '@/lib/publication/requirements'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './policy.module.css'

/*
 * What each country requires of a property advertisement.
 *
 * 🔒 THE SCREEN DOES NOT DECIDE ANYTHING. It shows what `resolveRequirements`
 * says, which is the same function the gate calls — so a reader cannot be told
 * one thing here and refused for another reason there. Re-deriving "is this
 * country usable" in a view is how two screens come to disagree, and the
 * register exists because that has happened.
 *
 * 🔴 THE TABLE IS GLOBAL, not per client. It is reached from a property, so it
 * lives under the client frame, but nothing here is this client's — and the
 * page says so rather than letting the frame imply it.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function kindOf(r: Requirement): string {
  if (r.kind === 'agency_registration') {
    return `a registration the agency holds${r.scope === 'regional' ? ', per region' : ', nationally'}${
      r.authority ? ` · ${r.authority}` : ''
    }`
  }
  return `a rating the property carries${r.shape === 'two_ratings' ? ', two values' : ''}${
    r.scale ? ` · ${r.scale}` : ''
  }`
}

export default async function PolicyPage({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let rows: PolicyRow[] | null = null
  let context: PolicyContext[] = []
  let threw = ''
  try {
    ;[rows, context] = await Promise.all([allAdvertisingPolicy(), policyContext()])
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  if (rows === null) {
    return (
      <>
        <h1 className={styles.title}>What each country requires</h1>
        <StateSurface meaning="red" className={styles.country}>
          <b>{whyEmpty({ state: 'readFailed', thing: 'the policy table', threw }).sentence}</b>
        </StateSurface>
      </>
    )
  }

  const at = new Date()
  const ctx = new Map(context.map((c) => [`${c.country}:${c.region ?? ''}`, c]))
  const countries = [...new Set(rows.map((r) => r.country))].sort()

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>What each country requires</h1>
          <p className={styles.sub}>
            Of a property advertisement. <b>This table is not {client.name}&rsquo;s</b> — it is what we have
            analysed about each jurisdiction, and every client in that country is judged against the same rows.
            Resolved as of <b>{at.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</b>, because
            a requirement can become effective on a date without anybody editing anything.
          </p>
        </div>
      </header>

      {countries.length === 0 ? (
        <p className={styles.absent}>
          {whyEmpty({ state: 'never', owner: 'this cockpit', thing: 'an analysed jurisdiction' }).sentence}
        </p>
      ) : (
        countries.map((country) => {
          const national = rows.find((r) => r.country === country && r.region === null)
          const regions = rows.filter((r) => r.country === country && r.region !== null)
          const c = ctx.get(`${country}:`)

          // 🔒 The gate's own answer, from the gate's own function.
          const verdict = resolveRequirements({ country, region: null, rows: rows ?? [], now: at })
          const confirmed = Boolean(national?.confirmed_at && national?.confirmed_by)

          return (
            <section className={styles.country} key={country}>
              <div className={styles.countryHead}>
                <h2>{country}</h2>
                {/* 🔴 An unconfirmed row is GREY, not blue. Blue means a rule
                    held something back — a conclusion. An unconfirmed row is
                    the ABSENCE of a confirmation, and §0.5 corrected this on
                    20 Sep precisely so a conclusion and an absence are never
                    one glance apart. */}
                {confirmed ? (
                  <StateChip meaning="through">confirmed by a lawyer</StateChip>
                ) : (
                  <StateChip meaning="grey">researched, not confirmed</StateChip>
                )}
                {national?.region_required && <StateChip meaning="held">a region must be declared</StateChip>}
              </div>

              <p className={styles.verdict}>
                {verdict.resolved ? (
                  <>
                    <b>Resolved.</b> {verdict.requirements.length} requirement
                    {verdict.requirements.length === 1 ? '' : 's'} apply to a national listing today.
                  </>
                ) : (
                  <>
                    <b>Not resolved — {verdict.reason}.</b> {RESOLUTION_MEANS[verdict.reason]}
                  </>
                )}
              </p>

              {national && national.requires.length > 0 && (
                <div className={styles.requires}>
                  {national.requires.map((r) => (
                    <div className={styles.req} key={r.id}>
                      <span>
                        <span className={styles.reqId}>{r.id}</span>
                        <span className={styles.reqWhat}>{kindOf(r)}</span>
                      </span>
                      <span className={styles.reqRight}>
                        {r.exemptible ? 'can be exempted' : 'cannot be exempted'}
                        {r.revocable && <> · can be revoked</>}
                        {/* A requirement with a date is the reason this page
                            carries a resolved-as-of stamp at all. */}
                        {r.effective_from && <> · from {r.effective_from}</>}
                        {r.effective_until && <> · until {r.effective_until}</>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.meta}>
                {c?.statute && (
                  <span>
                    <b>Statute:</b> {c.statute}
                  </span>
                )}
                {c?.authority && (
                  <span>
                    <b>Authority:</b> {c.authority}
                  </span>
                )}
                {confirmed ? (
                  <span>
                    <b>Confirmed:</b> {national?.confirmed_at?.slice(0, 10)} by {national?.confirmed_by}
                    {c?.confirmed_note && <> — {c.confirmed_note}</>}
                  </span>
                ) : (
                  <span>
                    <b>Researched:</b> {c?.researched_at?.slice(0, 10) ?? 'undated'}
                    {c?.source_note && <> — {c.source_note}</>}
                  </span>
                )}
                {national?.regions_exhaustive && <span>Its regions are enumerated — an unlisted region is a refusal.</span>}
              </div>

              {c?.traps && (
                <p className={styles.traps}>
                  <b>Traps:</b> {c.traps}
                </p>
              )}

              {regions.length > 0 && (
                <div className={styles.regions}>
                  {regions.map((r) => (
                    <div key={r.region} style={{ marginTop: 10 }}>
                      <span className={styles.regionName}>{r.region}</span>
                      <span className={styles.reqWhat}>
                        {r.requires.length} requirement{r.requires.length === 1 ? '' : 's'} of its own
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}

      <section className={styles.absent}>
        <h2>A country that is not on this page</h2>
        <p>
          It has no row at all, and that is a different thing from a row nobody has confirmed. A row that exists
          and is unconfirmed means somebody has read the law and a lawyer has not checked our reading. No row means
          we have not looked — nobody is reviewing it and no answer is coming.
        </p>
        <p>
          Nothing can be published in such a country, and the reason the gate gives is{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>no_policy_row</code> rather than a refusal about the property.
        </p>
      </section>
    </>
  )
}
