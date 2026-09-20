import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { templatesForScreen, type TemplateForScreen } from '@/lib/send/template-record'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateSurface, type Meaning } from '@/components/state-chip'
import styles from './templates.module.css'

/*
 * What Meta currently says about what this client may send under.
 *
 * 🔒 The screen states Meta's record and nothing else. It does not say a
 * campaign will or will not run — that is the gate's answer, and it depends on
 * pacing, consent and the send window as well as on a template.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

/*
 * 🔴 A REJECTION IS BLUE, NOT RED.
 *
 * Meta reviewing a template and saying no is a rule holding something back — a
 * decision, and the §0.5 meaning of blue. Red is "broken, or past its limit",
 * and a rejected template is neither: nothing failed, and an answer arrived.
 * Colouring it red would make a normal review outcome look like an incident.
 *
 * `submitted` is GREY rather than amber. It is waiting, but the clock is
 * Meta's and we hold no interval for it — and amber means a clock is the
 * reason, which would imply we knew how long.
 */
const MEANING: Record<TemplateForScreen['status'], Meaning> = {
  approved: 'through',
  rejected: 'held',
  paused: 'held',
  disabled: 'held',
  submitted: 'grey',
}

const WORD: Record<TemplateForScreen['status'], string> = {
  approved: 'approved by Meta',
  rejected: 'refused by Meta',
  paused: 'paused by Meta',
  disabled: 'disabled by Meta',
  submitted: 'submitted, no answer yet',
}

export default async function TemplatesPage({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let rows: TemplateForScreen[] | null = null
  let threw = ''
  try {
    rows = await templatesForScreen(clientId)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  if (rows === null) {
    return (
      <>
        <h1 className={styles.title}>Templates</h1>
        <StateSurface meaning="red" className={styles.card}>
          <b>{whyEmpty({ state: 'readFailed', thing: 'the templates', threw }).sentence}</b>
        </StateSurface>
      </>
    )
  }

  const approved = rows.filter((r) => r.status === 'approved').length

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Templates</h1>
          <p className={styles.sub}>
            What Meta says about what {client.name} may send under. <b>An approval belongs to their account</b>,
            not to the text — two agencies with identical wording hold two separate approvals.
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <section className={styles.card}>
          {/* 🔴 "No template has been submitted yet" — NOT "Meta has not
              answered". The second claims a submission that does not exist,
              which is the same distinction as an unanalysed country versus one
              awaiting a lawyer: an absence of our action, not a pending
              answer from somebody else. */}
          <p className={styles.empty}>
            <b>No template has been submitted for {client.name} yet.</b> Nothing is waiting on Meta — there is
            nothing for them to answer. Until one is approved, no campaign can open a conversation outside the
            24-hour window.
          </p>
        </section>
      ) : (
        <>
          <p className={styles.sub} style={{ marginBottom: 14 }}>
            <b>{approved}</b> approved of <b>{rows.length}</b> held.
          </p>
          {rows.map((t) => (
            <section className={styles.card} key={`${t.name}-${t.language}-${t.version}`}>
              <div className={styles.rowHead}>
                <span className={styles.name}>{t.name}</span>
                <span className={styles.lang}>
                  {t.language} · v{t.version} · {t.category}
                </span>
                <StateChip meaning={MEANING[t.status]}>{WORD[t.status]}</StateChip>
                <span className={styles.when}>since {t.statusChangedAt.slice(0, 10)}</span>
              </div>

              <div className={styles.body}>{t.body}</div>

              <div className={styles.meta}>
                {t.approvalId && (
                  <span>
                    <b>Approval:</b> {t.approvalId}
                  </span>
                )}
                {t.submittedAt && (
                  <span>
                    <b>Submitted:</b> {t.submittedAt.slice(0, 10)}
                  </span>
                )}
                {t.approvedAt && (
                  <span>
                    <b>Approved:</b> {t.approvedAt.slice(0, 10)}
                  </span>
                )}
                {t.qualityRating && (
                  <span>
                    <b>Quality:</b> {t.qualityRating}
                  </span>
                )}
                {t.sourceDocument && (
                  <span>
                    <b>From:</b> {t.sourceDocument}
                  </span>
                )}
              </div>

              {t.statusNote && <p className={styles.note}>{t.statusNote}</p>}
            </section>
          ))}
        </>
      )}

      <section className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          Nothing here is submitted, edited or withdrawn. A template is approved in Meta&rsquo;s own console and
          recorded here afterwards — the cockpit holds the record, not the account.
        </p>
        <p>
          An approved template does not mean a campaign will send. Pacing, consent and the 24-hour window are
          separate answers, and the gate gives them per contact rather than per template.
        </p>
      </section>
    </>
  )
}
