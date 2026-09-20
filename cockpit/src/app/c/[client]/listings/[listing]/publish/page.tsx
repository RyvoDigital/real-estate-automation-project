import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { decideAndRecord, type Decision } from '@/lib/publication/decide'
import { REFUSAL_MEANS } from '@/lib/publication/gate'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateMark, StateSurface } from '@/components/state-chip'
import styles from './publish.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * MAY THIS PROPERTY BE ADVERTISED — and the first caller decidePublication has
 * ever had.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §6.1. This screen IS the decision path: opening it asks the gate,
 * and `decideAndRecord` keeps the answer in the same act, because a clearance
 * recorded by something other than the thing that decided it is a second
 * source of truth about the same act.
 *
 * 🔒 THREE THINGS IT RENDERS THAT A READER WOULD OTHERWISE INFER WRONGLY:
 *
 *   the refusal that FIRED, not the one expected — today Portugal's policy row
 *   refuses before anybody's missing certificate is reached, so the
 *   requirements below are shown with a line saying they are not the cause;
 *
 *   whether the decision was KEPT — a clean verdict over a silently failed
 *   write is the shape improvements §3.22 is about, so the record's outcome is
 *   on the page;
 *
 *   and "nobody said which country" as its own state, never as the gate's
 *   `no_policy_row`, which would blame our analysis for a field nobody filled.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function Verdict({ d }: { d: Decision }) {
  if (d.undecidable) {
    return (
      <StateSurface meaning="grey" className={styles.verdict}>
        <StateMark meaning="grey" label="not asked" />
        <span>
          <b>The gate has not been asked.</b> {d.undecidable.detail}
          <span className={styles.which}>{d.undecidable.reason}</span>
        </span>
      </StateSurface>
    )
  }

  const v = d.verdict
  if (!v) return null

  if (v.cleared) {
    return (
      <StateSurface meaning="through" className={styles.verdict}>
        <StateMark meaning="through" label="cleared" />
        <span>
          <b>Yes, on the facts below.</b> Every requirement this jurisdiction asks of an advertisement is held
          for this property.
          {/* 🔒 Clearing is not publishing. The agency publishes, in their own
              channels, and this screen has never had a control that would. */}
          <span className={styles.which}>
            It does not mean anything has been advertised — preparing the advertisement is a separate act, and
            publishing it is the agency&rsquo;s.
          </span>
        </span>
      </StateSurface>
    )
  }

  return (
    <StateSurface meaning="red" className={styles.verdict}>
      <StateMark meaning="red" label="refused" />
      <span>
        <b>No — and this is the refusal that fired.</b> {v.detail}
        <span className={styles.which}>
          {v.reason}
          {v.requirementId && <> · {v.requirementId}</>}
        </span>
      </span>
    </StateSurface>
  )
}

function Kept({ d }: { d: Decision }) {
  if (!d.recorded) return null
  const r = d.recorded

  if (r.kind === 'recorded') {
    return (
      <StateSurface meaning="through" className={styles.kept}>
        <b>Kept.</b> This clearance was recorded at {new Date(r.decidedAt).toLocaleString('en-GB')}, with a
        snapshot of what was true when it was made — which is what a later re-check compares against.
      </StateSurface>
    )
  }

  if (r.kind === 'already_stood') {
    return (
      <StateSurface meaning="grey" className={styles.kept}>
        <b>A clearance already stood</b>, from {new Date(r.decidedAt).toLocaleString('en-GB')}, and it has been
        left exactly as it was. Refreshing its date on every look would make &ldquo;what was true then&rdquo;
        always equal &ldquo;what is true now&rdquo;, and the re-check would find nothing, forever.
      </StateSurface>
    )
  }

  return (
    <StateSurface meaning="red" className={styles.kept}>
      {/* 🔴 Never swallowed. The gate decided and the decision was not kept,
          which is a different and worse state than a refusal. */}
      <b>The gate decided and the decision was not kept.</b> {r.why}
    </StateSurface>
  )
}

export default async function PublishPage({
  params,
}: {
  params: Promise<{ client: string; listing: string }>
}) {
  await requireOperator()
  const { client: clientId, listing: listingId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let d: Decision | null = null
  let threw = ''
  try {
    d = await decideAndRecord({ clientId, listingId })
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  if (!d) {
    return (
      <>
        <h1 className={styles.title}>May this property be advertised?</h1>
        <StateSurface meaning="red" className={styles.verdict}>
          <StateMark meaning="red" label="the read failed" />
          <span>
            <b>{whyEmpty({ state: 'readFailed', thing: 'this property', threw }).sentence}</b>
            <span className={styles.which}>{threw}</span>
          </span>
        </StateSurface>
      </>
    )
  }

  const satisfied = d.verdict?.cleared ? d.verdict.evidence.satisfied : []
  const policyRefused = d.verdict && !d.verdict.cleared && d.verdict.reason === 'policy_not_confirmed'

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>May this property be advertised?</h1>
          <p className={styles.sub}>
            {d.subject.reference ?? 'a property with no reference'} · {client.name}
            {d.subject.country && <> · {d.subject.country}</>}
            {d.subject.region && <>/{d.subject.region}</>}. <b>The gate names the requirement, never the column</b>,
            and the refusal shown is the one that actually fired.
          </p>
        </div>
        <span className={styles.stamp}>
          <span>Decided</span>
          <b>{new Date(d.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
          <span>from the policy row and the facts read at that moment</span>
        </span>
      </header>

      <Verdict d={d} />
      <Kept d={d} />

      {satisfied.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>What was satisfied</h2>
            <span className={styles.count}>
              <b>{satisfied.length}</b> requirement{satisfied.length === 1 ? '' : 's'}
            </span>
            <span className={styles.note}>this is the snapshot the clearance keeps</span>
          </div>
          {satisfied.map((s) => (
            <div className={styles.req} key={s.requirementId}>
              <span>
                <span className={styles.reqName}>{s.requirementId}</span>
                <span className={styles.reqLaw}>
                  {s.kind === 'agency_registration' ? 'a registration the agency holds' : 'a rating the property carries'}
                </span>
                <span className={styles.hold}>
                  We hold: <b>{s.number ?? JSON.stringify(s.values)}</b>
                  {s.exemption && <> — exempt, declared by {s.exemption.declared_by}</>}
                </span>
              </span>
              <span className={styles.right}>
                {s.exemption ? (
                  <StateChip meaning="held">exempt</StateChip>
                ) : (
                  <StateChip meaning="through">held</StateChip>
                )}
                {s.validUntil && <span className={styles.date}>valid until {s.validUntil}</span>}
              </span>
            </div>
          ))}
        </section>
      )}

      {policyRefused && (
        <section className={styles.card}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>
            {/* 🔒 The gate screen's central finding, rendered rather than left
                for the reader to work out. */}
            Nothing about this property is what is stopping it. <b>The policy row refuses first</b>, and it would
            refuse even if every requirement were held.
          </p>
        </section>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>No &ldquo;publish anyway&rdquo;. There is no override and no control that confirms a policy row.</p>
        <p>No requirement is edited here, and no fact is declared here — that is the declaration, with an author.</p>
        <p>The country and the region are entered by a person, never inferred from a town name.</p>
        <p>Clearing is not publishing. The agency publishes, in the agency&rsquo;s own channels.</p>
      </div>
    </>
  )
}
