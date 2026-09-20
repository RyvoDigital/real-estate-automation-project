import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { getClients, getAnomalyTallyForClient } from '@/lib/data'
import { readAutomations, RUN_ERROR_WINDOW_DAYS } from '@/lib/landing/automations'
import { bands, type AnomalyTally, type Band, type BandItem } from '@/lib/landing/bands'
import { minutesSince } from '@/lib/escalation'
import { whyEmpty } from '@/lib/why-empty'
import { Clock } from '@/components/Clock'
import { Live } from '@/components/Live'
import { StateChip, StateMark, StateSurface } from '@/components/state-chip'
import styles from './landing.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLIENT LANDING — is anything here wrong, and is it something I can fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §1, question Q2.
 *
 * 🔒 NOT A DASHBOARD, and not a summary of the screens beneath it. Every number
 * on it is a door. The clocks strip restates nothing in the bands — it exists
 * because an S1 landing saying "nothing is notable" and an S3 landing that
 * could not look are the same empty page unless the clocks are still there.
 *
 * 🔒 THE BANDS ARE ORDERED BY WHO CAN ACT, never by severity. A critical
 * anomaly I can fix in four minutes and a critical anomaly held behind a lawyer
 * since August make different calls on a morning, however alike they look.
 *
 * 🔴 NO SCORE, NO GRADE, NO COLOUR FOR THE CLIENT AS A WHOLE — and `bands()`
 * does not return one, so this page could not render one if it tried.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Whether this is a rehearsal client.
 *
 * 🔴 `0037` IS WRITTEN AND NOT APPLIED. `clients.rehearsal` does not exist in
 * production yet, and selecting a column that is not there fails the whole
 * query — so this is asked on its own and its failure is a THIRD answer.
 *
 *   true / false   the column exists and says so
 *   null           we do not know, because the migration has not landed
 *
 * Returning false on failure would tell the operator that a rehearsal client's
 * figures count towards the business, which is the one thing 0037 exists to
 * prevent. `[[ryvo-invariants-built]]` — the rehearsal flag is classified, not
 * assumed.
 */
async function readRehearsal(clientId: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin().from('clients').select('rehearsal').eq('id', clientId).single()
    if (error) return null
    return typeof data?.rehearsal === 'boolean' ? data.rehearsal : null
  } catch {
    return null
  }
}

function Item({ item, at }: { item: BandItem; at: number }) {
  const body = (
    <>
      <StateMark meaning={item.tone} label={item.tone === 'red' ? 'wrong' : item.tone === 'held' ? 'held' : 'waiting'} />
      <span className={styles.itemBody}>
        <span className={styles.itemWhat}>{item.what}</span>
        {/* The stored code, in mono, because it is a value the system holds
            rather than a sentence we wrote. */}
        {item.code && <span className={styles.code}>{item.code}</span>}
        {item.opens && <span className={styles.opens}>{item.opens.label}</span>}
      </span>
      {item.since && (
        <Clock
          at={new Date(item.since).toISOString()}
          serverMinutes={minutesSince(new Date(item.since).toISOString(), at)}
          scale="days"
          word="waiting"
        />
      )}
    </>
  )

  if (!item.opens) {
    return (
      <div className={styles.item} key={item.id}>
        {body}
      </div>
    )
  }
  return (
    <Link className={`${styles.item} ${styles.door}`} href={item.opens.href} key={item.id}>
      {body}
    </Link>
  )
}

function BandBlock({ band, at }: { band: Band; at: number }) {
  return (
    <section className={styles.band} id={band.key === 'nobodys' ? 'nobodys-yet' : undefined}>
      <header className={styles.bandHead}>
        <h2>{band.title}</h2>
        {band.items.length > 0 && <span className={styles.count}>{band.items.length}</span>}
        <span className={styles.scope}>{band.scope}</span>
      </header>

      {band.items.length > 0 ? (
        <div className={styles.items}>
          {band.items.map((i) => (
            <Item item={i} at={at} key={i.id} />
          ))}
        </div>
      ) : (
        <StateSurface meaning={band.empty!.tone} className={styles.empty}>
          {band.empty!.sentence}
        </StateSurface>
      )}
    </section>
  )
}

export default async function ClientLanding({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const at = Date.now()

  // 🔒 Each read is caught on its own. One failure degrades one band; it never
  // takes the page, and it never becomes a confident absence somewhere else.
  const [automations, rehearsal, tally] = await Promise.all([
    readAutomations(clientId),
    readRehearsal(clientId),
    getAnomalyTallyForClient(clientId).catch((e): { threw: string } => ({
      threw: e instanceof Error ? e.message : String(e),
    })),
  ])

  const anomalies: AnomalyTally | null = 'threw' in tally ? null : tally
  const result = bands({
    clientId,
    automations,
    anomalies,
    anomaliesThrew: 'threw' in tally ? tally.threw : undefined,
  })

  // S2: the state both clients are actually in today.
  const neverRan = automations !== null && automations.length > 0 && automations.every((a) => a.lastRun === null)

  return (
    <Live serverNow={at}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{client.name}</h1>
          <p className={styles.sub}>
            Is anything here wrong, and is it something I can fix. <b>Ordered by who can act</b>, never by how loud it
            is.
          </p>
        </div>
        <span className={styles.stamp}>
          <span>Read</span>
          <b>{new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
          <span>each band from its own query</span>
        </span>
      </header>

      {/* 🔴 A rehearsal client says so, and an unknown flag says THAT rather
          than defaulting to "real". */}
      {rehearsal === true && (
        <StateSurface meaning="held" className={styles.rehearsal}>
          <b>A rehearsal client.</b> Everything below is real and is kept out of the business&rsquo;s own numbers.
        </StateSurface>
      )}
      {rehearsal === null && (
        <StateSurface meaning="grey" className={styles.rehearsal}>
          {
            whyEmpty({
              state: 'notChecked',
              thing: 'whether this is a rehearsal client',
              why: 'migration 0037 adds the column and has not been applied',
              notTheSameAs: 'a client we know to be real',
            }).sentence
          }
        </StateSurface>
      )}

      {/* ── the clocks strip ──────────────────────────────────────────────── */}
      <section className={styles.clocks} aria-label="Each automation, and when it last ran">
        {automations === null ? (
          <StateSurface meaning="red" className={styles.empty}>
            {
              whyEmpty({
                state: 'readFailed',
                thing: "this client's automations",
                threw: 'the automations could not be read',
              }).sentence
            }
          </StateSurface>
        ) : automations.length === 0 ? (
          <StateSurface meaning="grey" className={styles.empty}>
            {whyEmpty({ state: 'never', owner: 'this client', thing: 'an automation configured for them' }).sentence}
          </StateSurface>
        ) : (
          automations.map((a) => (
            <div className={styles.clockCell} key={a.key}>
              <span className={styles.autoName}>{a.name}</span>
              <StateChip meaning={a.status.tone}>{a.status.word}</StateChip>
              {a.lastRun ? (
                <Clock
                  at={a.lastRun.at}
                  serverMinutes={minutesSince(a.lastRun.at, at)}
                  scale="since"
                  word="since it last ran"
                />
              ) : (
                // 🔒 Not a dash and not a zero. An automation that has never
                // run has no elapsed time to show, and "0m" would say it just
                // ran (§5i — casting an absence is a decision to invent).
                <span className={styles.noClock}>no run to measure from</span>
              )}
              {a.status.heldBy && (
                <a className={styles.heldBy} href={a.status.heldBy.href}>
                  held by {a.status.heldBy.what}
                </a>
              )}
            </div>
          ))
        )}
      </section>

      {neverRan && (
        <StateSurface meaning="grey" className={styles.never}>
          {
            whyEmpty({
              state: 'never',
              owner: 'this client',
              thing: 'a lead, a listing or a send — no automation has ever run for them',
            }).sentence
          }
        </StateSurface>
      )}

      {result.map((b) => (
        <BandBlock band={b} at={at} key={b.key} />
      ))}

      {/* 🔴 The anomalies the client filter cannot see, said rather than
          silently dropped — otherwise this page and the anomalies screen would
          disagree and neither would say why. */}
      {anomalies !== null && anomalies.unattributed > 0 && (
        <p className={styles.unattributed}>
          {anomalies.unattributed} anomal{anomalies.unattributed === 1 ? 'y' : 'ies'} in the last{' '}
          {RUN_ERROR_WINDOW_DAYS} days name no client at all, so they are not counted above. They appear on the
          operator&rsquo;s anomalies screen.
        </p>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          No score, no grade and no single colour for this client. A ninety-minute wait and an unanswered lawyer
          question are not one number, and the bands exist so they never become one.
        </p>
        <p>No configuration, and no switch that turns an automation on or off — that is settings.</p>
        <p>Nothing about any other client appears here, and nothing here is compared against one.</p>
        <p>
          It does not say &ldquo;viewings&rdquo;. What the Concierge books is an introductory meeting between the lead
          and one of the agency&rsquo;s people, whatever the column is called.
        </p>
      </div>
    </Live>
  )
}
