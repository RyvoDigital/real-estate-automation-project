import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { fromPathSegment } from '@/lib/contact/phone-url'
import { readContact, type LedgerEvent, type PanelOrUnknown, type SendRow } from '@/lib/contact/read'
import { showsCollapsed } from '@/lib/contact/staleness'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateMark, StateSurface, type Meaning } from '@/components/state-chip'
import styles from './contact.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTACT RECORD — Q13, and 🔴 Q14: why did this person NOT get the message?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief II §1. 🔴 **This screen is the Article 15 answer** (§1.11): a data
 * subject asking what we hold and why we messaged them is answered by this page
 * and nothing else. That is why the ledger is history rather than a current
 * value, why both clocks are shown, and why a refusal is never overwritten by a
 * better one.
 *
 * 🔒 Scoped to `(client_id, phone_e164)`, never to a lead row.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/* ── the send verdict, as a shape before it is read as text ───────────────── */

function verdictOf(s: SendRow): { meaning: Meaning; word: string } {
  if (s.layer === 'pacing') return { meaning: 'clock', word: 'paced' }
  if (s.status === 'unresolved') return { meaning: 'grey', word: 'we do not know' }
  if (s.status === 'failed') return { meaning: 'red', word: 'failed' }
  if (s.status === 'sent') return { meaning: 'through', word: 'sent' }
  // 🔒 A refusal is HELD, not RED. §0.5: red is broken or past a limit. A gate
  // refusing correctly is a rule working, and colouring it as breakage would
  // send somebody to fix the gate.
  if (s.verdict === 'refused') return { meaning: 'held', word: 'refused' }
  return { meaning: 'grey', word: s.status }
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

/* ── a send row ───────────────────────────────────────────────────────────── */

function Send({ s, open }: { s: SendRow; open: boolean }) {
  const v = verdictOf(s)
  // 🔒 The stored sentence IS the answer to Q14, so it is on the COLLAPSED row.
  // Hiding it behind a click means the screen does not answer its own question
  // until it is touched.
  const sentence = s.verdict === 'refused' ? s.detail : s.status === 'failed' ? s.error : s.basis
  const bodyMismatch = s.bodySent !== null && s.bodyIntended !== null && s.bodySent !== s.bodyIntended

  return (
    <details className={styles.send} open={open}>
      <summary className={styles.sendHead}>
        <StateMark meaning={v.meaning} label={v.word} />
        <span className={styles.sendBody}>
          <span className={styles.verb}>
            <b>{v.word}</b> {day(s.intentRecordedAt)} · {s.automation}
            {s.templateName && <> · {s.templateName}</>}
          </span>
          {sentence ? (
            <span className={styles.sentence}>{sentence}</span>
          ) : (
            <span className={styles.sentenceMissing}>no sentence was stored with this decision</span>
          )}

          {/* 🔒 Two facts are NEVER behind the click. A collapsed stale refusal
              that reads as current is the defect §1.4.1 exists to prevent, and
              a body mismatch is a defect somebody needs to see. */}
          {showsCollapsed(s.staleness) && (
            <span className={styles.flag}>
              {s.staleness.state === 'cause_gone'
                ? 'The reason given here has since been resolved'
                : s.staleness.state === 'notChecked'
                  ? 'We have not checked whether anything has changed since'
                  : 'Something this decision depended on has changed since'}
            </span>
          )}
          {bodyMismatch && <span className={styles.flag}>What was sent differs from what was going to be sent</span>}
        </span>
        <span className={styles.decided}>{day(s.decidedAt)}</span>
      </summary>

      <div className={styles.sendMore}>
        {s.verdict === 'refused' && (
          <p className={styles.line}>
            <span className={styles.k}>Layer</span>
            <span>
              {s.layer ?? 'not recorded'} · <code>{s.reason ?? 'no reason stored'}</code>
            </span>
          </p>
        )}
        {s.basis && (
          <p className={styles.line}>
            <span className={styles.k}>Authorised by</span>
            <span>{s.basis}</span>
          </p>
        )}
        <p className={styles.line}>
          <span className={styles.k}>Decided</span>
          <span>
            {stamp(s.decidedAt)}
            {s.staleness.state !== 'current' && <em className={styles.stale}> — {s.staleness.sentence}</em>}
          </span>
        </p>
        {'movers' in s.staleness &&
          s.staleness.movers.map((m) => (
            <p className={styles.line} key={m}>
              <span className={styles.k} />
              <span className={styles.mover}>· {m}</span>
            </p>
          ))}
        {(s.country || s.segment) && (
          <p className={styles.line}>
            <span className={styles.k}>Jurisdiction</span>
            <span>
              {s.country ?? 'no country'}
              {s.segment && <> · segment {s.segment}</>}
            </span>
          </p>
        )}
        {s.status === 'unresolved' && (
          <p className={styles.line}>
            <span className={styles.k}>Reconciled</span>
            {/* 🔒 0019: null here means reconciliation has not run YET, not that
                it failed. Two different facts. */}
            <span>{s.reconciledAt ? stamp(s.reconciledAt) : 'not yet — the key has not been chased'}</span>
          </p>
        )}
        {s.bodyIntended && (
          <p className={styles.line}>
            <span className={styles.k}>Was to send</span>
            <span className={styles.stored}>{s.bodyIntended}</span>
          </p>
        )}
        {s.bodySent && (
          <p className={styles.line}>
            {/* 🔒 From the wire, not from a flag. */}
            <span className={styles.k}>Sent, from the wire</span>
            <span className={styles.stored}>{s.bodySent}</span>
          </p>
        )}
        {s.attempts > 0 && (
          <p className={styles.line}>
            <span className={styles.k}>Attempts</span>
            <span>{s.attempts}</span>
          </p>
        )}
      </div>
    </details>
  )
}

/* ── panels ───────────────────────────────────────────────────────────────── */

function Panel({
  title,
  answers,
  rows,
  empty,
  children,
}: {
  title: string
  answers: string
  rows: PanelOrUnknown<unknown>
  empty: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h2>{title}</h2>
        <span className={styles.answers}>{answers}</span>
        {rows !== null && rows.length > 0 && <span className={styles.count}>{rows.length}</span>}
      </header>
      {rows === null ? (
        // 🔴 S3/S4. A blank panel and a panel with nothing in it are opposite
        // claims, and on the ledger the difference decides whether this person
        // may be messaged at all.
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: title.toLowerCase(), threw: 'the read did not return' }).sentence}
        </StateSurface>
      ) : rows.length === 0 ? (
        <StateSurface meaning="grey" className={styles.empty}>
          {empty}
        </StateSurface>
      ) : (
        children
      )}
    </section>
  )
}

const LEDGER_MEANS: Record<string, string> = {
  claimed: 'the agency asserted something we cannot evidence',
  claim_revoked: 'the import behind a claim was undone',
  declared: 'the agency classified this contact',
  consent_given: 'consent was given',
  consent_withdrawn: 'consent was withdrawn',
  objection: 'an objection — permanent and irreversible',
  quarantined: 'OUR correction of a record we should not have written',
  erasure: 'an erasure',
}

function Ledger({ e }: { e: LedgerEvent }) {
  const meaning: Meaning = e.kind === 'objection' ? 'red' : e.kind === 'quarantined' ? 'held' : 'grey'
  return (
    <div className={styles.event}>
      <StateChip meaning={meaning}>{e.kind}</StateChip>
      <span className={styles.eventBody}>
        <span>{LEDGER_MEANS[e.kind] ?? 'a kind this screen has no wording for'}</span>
        <span className={styles.clocks}>
          {/* 🔒 TWO CLOCKS, NEVER ONE COLUMN. Collapsing them produced an
              impossible timestamp once already (lesson 10), and it is the
              difference between "they consented in 2019" and "we heard about
              it in 2026". */}
          {e.occurredAt ? `Happened ${day(e.occurredAt)}` : 'When it happened is not known'} · recorded{' '}
          {day(e.recordedAt)}
        </span>
        <span className={styles.meta}>
          via {e.source}
          {e.segment && <> · segment {e.segment}</>}
          {e.declaredBy && <> · declared by {e.declaredBy}</>}
        </span>
        {e.wording ? (
          <span className={styles.stored}>{e.wording}</span>
        ) : (
          <span className={styles.meta}>The wording was not retained.</span>
        )}
      </span>
    </div>
  )
}

/* ── the page ─────────────────────────────────────────────────────────────── */

export default async function ContactRecord({
  params,
}: {
  params: Promise<{ client: string; phone: string }>
}) {
  await requireOperator()
  const { client: clientId, phone } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  // 🔒 Refused, never repaired. A guess looks exactly like a lookup that found
  // nothing, and on this screen "found nothing" is a legal answer.
  const parsed = fromPathSegment(phone)
  if (!parsed.ok) {
    return (
      <>
        <h1 className={styles.title}>That is not a number we can look up</h1>
        <StateSurface meaning="grey" className={styles.empty}>
          The address carried <code>{parsed.raw.slice(0, 40)}</code>, which is not a phone number in international
          form. It has <b>not</b> been guessed at: a repaired number would look exactly like a correct lookup that
          found nobody, and on this screen that is an answer with legal weight.
        </StateSurface>
      </>
    )
  }

  const r = await readContact(clientId, parsed.e164)

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{r.name ?? r.e164}</h1>
          <p className={styles.sub}>
            {r.name && <span className={styles.num}>{r.e164}</span>}
            {r.name && ' · '}
            {client.name} · <b>why this person did or did not get a message</b>
          </p>
        </div>
        <span className={styles.stamp}>
          <span>Read</span>
          <b>{new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
          <span>each panel from its own query</span>
        </span>
      </header>

      {/* 🔴 A reserved test number is a fixture, not a person. */}
      {r.reserved && (
        <StateSurface meaning="held" className={styles.banner}>
          <b>This is a reserved test number.</b> The gate&rsquo;s first layer refuses it and a database constraint
          forbids sending to it. It is a fixture, not a person.
        </StateSurface>
      )}

      {r.unknown && (
        // 🔴 S2, and deliberately different words from S1. It must not offer to
        // create anything.
        <StateSurface meaning="grey" className={styles.banner}>
          {whyEmpty({ state: 'never', owner: 'this client', thing: 'any record of this number' }).sentence} Nothing
          here can be created from this page.
        </StateSurface>
      )}

      <Panel
        title="What we sent, and what we refused"
        answers="the answer to “why did this person not get the message”"
        rows={r.sends}
        empty="No message has ever been attempted to this number for this client. That is not a refusal — nothing has been tried."
      >
        <div className={styles.sends}>
          {(r.sends ?? []).map((s, i) => (
            <Send s={s} open={i === 0} key={s.id} />
          ))}
        </div>
      </Panel>

      <Panel
        title="The consent ledger"
        answers="what we were told, by whom, and when — as history, never as a current value"
        rows={r.ledger}
        empty="Nothing has ever been recorded about this number. That is not consent, and it is not a refusal — it is an empty ledger."
      >
        <div className={styles.events}>
          {(r.ledger ?? []).map((e) => (
            <Ledger e={e} key={e.id} />
          ))}
        </div>
      </Panel>

      <Panel
        title="Leads"
        answers="what has happened to them"
        rows={r.leads}
        empty="This number has no lead row. After an import that is normal, and the ledger above still applies."
      >
        <div className={styles.events}>
          {(r.leads ?? []).map((l) => (
            <Link className={styles.lead} href={`/leads/${l.id}`} key={l.id}>
              <span>{l.name ?? r.e164}</span>
              <span className={styles.meta}>
                {l.stage ?? 'no stage'} · created {day(l.createdAt)}
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel
        title="Messages"
        answers="what was actually said"
        rows={r.messages}
        empty="No message has been exchanged with this number."
      >
        <div className={styles.events}>
          {r.messagesCapped && (
            <p className={styles.meta}>
              Showing the most recent 200. There are more — this is a cap, not a total.
            </p>
          )}
          {(r.messages ?? []).map((m) => (
            <div className={styles.msg} key={m.id}>
              <span className={styles.meta}>
                {m.direction} · {day(m.createdAt)}
                {m.origin && <> · {m.origin}</>}
                {/* 🔴 'unknown' is a THIRD thing. The lookup failed; it is not
                    organic and not campaign, and it is never folded into either. */}
                {m.attributionState === 'unknown' && <> · attribution not known, never assumed</>}
                {m.leadId === null && <> · its lead row is gone, and this record remains</>}
              </span>
              {m.body && <span className={styles.stored}>{m.body}</span>}
            </div>
          ))}
        </div>
      </Panel>

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          Nothing here can be edited. The ledger is append-only: a correction is a new event, with its own author and
          its own date.
        </p>
        <p>
          No refusal is re-sent and none is recomputed. A refusal is a record of a decision that was taken; where
          something it depended on has changed, this page says so and leaves the row exactly as it was.
        </p>
        <p>No objection can be removed here, and no segment E assigned — an objection comes from the contact.</p>
        <p>Nothing about this number for any other client appears here. Consent is per client.</p>
        <p>No contact is deleted from this page. Erasure is a runbook with a legal deadline, not a button.</p>
      </div>
    </>
  )
}
