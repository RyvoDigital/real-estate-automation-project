import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { agencyFacts, clientFacts, listingReferences } from '@/lib/publication/facts-store'
import { classifyStillGood, type PropertyDocument, type Registration } from '@/lib/publication/still-good'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateMark, StateSurface, type Meaning } from '@/components/state-chip'
import styles from './still-good.module.css'

/*
 * What is still good. Brief III §2.3's territory, under a name that describes
 * the whole of it.
 *
 * 🔴 IT ANSWERS A NARROWER QUESTION THAN THE DESIGNED SCREEN, AND SAYS SO ON
 * THE PAGE. The clearance re-check needs a `clearances` table nothing writes
 * (improvements §3.22). This reads documents and registrations, which is what
 * the tables hold — so it can say a certificate has expired, and it cannot say
 * a property may no longer be advertised. The difference is rendered rather
 * than left for the reader to infer.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/*
 * 🔴 There WAS a DOC_MEANING map here with a `through` key where `good` should
 * have been, silenced by an `as unknown as` cast — which is how a typo becomes
 * a runtime undefined that renders an unstyled chip. The cast was doing the
 * exact job the type was there to do, in reverse.
 *
 * It is gone rather than fixed, because the meanings are inlined at the one
 * place they are used. REG_MEANING below is a real map with no cast, and the
 * compiler checks it.
 */
const DOC_WORD: Record<PropertyDocument['standing'], string> = {
  past: 'past its date',
  soon: 'runs out soon',
  good: 'in date',
}

const REG_MEANING: Record<Registration['standing'], Meaning> = {
  not_valid: 'red',
  // 🔒 Never checked and stale are GREY, not amber. They are absences of
  // knowledge, and §0.5 never colours uncertainty — colouring them would
  // assert something about the registration that we do not know.
  never_checked: 'grey',
  stale: 'grey',
  good: 'through',
}

const REG_WORD: Record<Registration['standing'], string> = {
  not_valid: 'not valid',
  never_checked: 'never checked',
  stale: 'not checked lately',
  good: 'checked, and valid',
}

export default async function StillGoodPage({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let read: ReturnType<typeof classifyStillGood> | null = null
  let threw = ''
  try {
    const [facts, regs, refs] = await Promise.all([
      clientFacts(clientId),
      agencyFacts(clientId),
      listingReferences(clientId),
    ])
    read = classifyStillGood({ propertyFacts: facts, agencyFacts: regs, listings: refs })
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  if (read === null) {
    return (
      <>
        <header className={styles.head}>
          <h1 className={styles.title}>What is still good</h1>
        </header>
        <StateSurface meaning="red" className={styles.card}>
          <b>{whyEmpty({ state: 'readFailed', thing: 'the documents', threw }).sentence}</b>
        </StateSurface>
      </>
    )
  }

  const needAttention = read.documents.filter((d) => d.standing !== 'good')
  const regsNeedAttention = read.registrations.filter((r) => r.standing !== 'good')
  const asOf = new Date(read.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>What is still good</h1>
          <p className={styles.sub}>
            The documents and registrations {client.name} holds, by their dates. <b>Counted on {asOf}</b> — a date
            that passes tomorrow changes this without anybody editing anything.
          </p>
        </div>
      </header>

      {/* ── the properties' documents ───────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Certificates</h2>
          <span className={styles.count}>
            <b>{read.documents.length}</b> dated · <b>{needAttention.length}</b> want attention
            {read.exempt > 0 && (
              <>
                {' '}
                · <b>{read.exempt}</b> exempt, which have no date to run out
              </>
            )}
          </span>
          <span className={styles.note}>worst first · {read.warnWithinDays} days of warning</span>
        </div>

        {read.documents.length === 0 ? (
          <p className={styles.empty}>
            {
              whyEmpty({
                state: 'never',
                owner: client.name,
                thing: 'a dated certificate recorded against any property',
              }).sentence
            }
          </p>
        ) : (
          read.documents.map((d) => (
            <div className={styles.row} key={`${d.listingId}-${d.requirementId}`}>
              <span>
                <span className={styles.ref}>{d.reference ?? 'a property with no reference'}</span>
                <span className={styles.what}>
                  {d.requirementId}
                  {d.certificateNumber && <> · {d.certificateNumber}</>}
                </span>
              </span>
              <span>
                <StateChip meaning={d.standing === 'past' ? 'red' : d.standing === 'soon' ? 'clock' : 'through'}>
                  {DOC_WORD[d.standing]}
                </StateChip>
              </span>
              <span className={styles.when}>
                <b>
                  {d.daysLeft < 0 ? `${Math.abs(d.daysLeft)} days ago` : `${d.daysLeft} days`}
                </b>
                {d.validUntil}
              </span>
            </div>
          ))
        )}
      </section>

      {/* ── the agency's registrations ──────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Registrations</h2>
          <span className={styles.count}>
            <b>{read.registrations.length}</b> held · <b>{regsNeedAttention.length}</b> want attention
          </span>
          <span className={styles.note}>a status is re-asked after {read.staleAfterDays} days</span>
        </div>

        {read.registrations.length === 0 ? (
          <StateSurface meaning="red" className={styles.empty} >
            {/* 🔴 Not a resting state. A client with no registration cannot
                publish anything — the gate refuses every property on that
                ground — and improvements §3.22 records that nothing writes
                this row for anybody. An empty list here is a finding. */}
            <span style={{ display: 'block', padding: '14px 16px' }}>
              <StateMark meaning="red" label="nothing recorded" />{' '}
              <b>No registration is recorded for {client.name}.</b> Every property is refused publication on that
              ground until one is — and nothing in the cockpit writes this row yet, for any client.
            </span>
          </StateSurface>
        ) : (
          read.registrations.map((r) => (
            <div className={styles.row} key={`${r.requirementId}-${r.number}`}>
              <span>
                <span className={styles.ref}>{r.number}</span>
                <span className={styles.what}>
                  {r.requirementId} · {r.country}
                  {r.region && <>/{r.region}</>}
                </span>
              </span>
              <span>
                <StateChip meaning={REG_MEANING[r.standing]}>{REG_WORD[r.standing]}</StateChip>
              </span>
              <span className={styles.when}>
                {/* ⚠️ Null is not zero. A registration nobody has checked has
                    no interval, and "0 days ago" would be a figure computed
                    from an absence. */}
                {r.daysSinceChecked === null ? (
                  <span className={styles.unknown}>never checked</span>
                ) : (
                  <>
                    <b>{r.daysSinceChecked} days ago</b>
                    {r.checkedAt?.slice(0, 10)}
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </section>

      <section className={styles.cannot}>
        <h2>What this screen cannot tell you</h2>
        <ul>
          {read.notAnswered.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>
    </>
  )
}
