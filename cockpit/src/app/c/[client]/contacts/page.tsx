import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { toE164 } from '@/lib/jurisdiction'
import { contactHref } from '@/lib/contact/phone-url'
import { readAttention, REASON_MEANS, ATTENTION_CAP } from '@/lib/contact/attention'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './contacts.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * A SEARCH, AND A SHORT SET OF CONTACTS WITH SOMETHING WRONG.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔒 NOT A BROWSABLE LIST. §1.2: the consent ledger is read with the agency one
 * contact at a time. An index of every number an agency holds is also the thing
 * most likely to be screenshotted, and every row here earns its place by
 * needing something DONE — never by being recently active.
 *
 * 🔒 The search NORMALISES before looking. `+351 912 345 678`, `912345678` and
 * `00351912345678` are one contact, and a search treating them as three answers
 * Q14 with "no record" about a person who has one.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Contacts({
  params,
  searchParams,
}: {
  params: Promise<{ client: string }>
  searchParams: Promise<{ q?: string }>
}) {
  await requireOperator()
  const [{ client: clientId }, { q }] = await Promise.all([params, searchParams])
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  // 🔒 One parser, and a hit goes straight to the record rather than listing it.
  const asked = (q ?? '').trim()
  if (asked) {
    const e164 = toE164(asked)
    if (e164) redirect(contactHref(clientId, e164))
  }

  const attention = await readAttention(clientId)

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Contacts</h1>
        <p className={styles.sub}>
          Find one person by number, or pick up the ones with something currently wrong. <b>This is not a list of
          everybody</b> — the consent ledger is read one contact at a time.
        </p>
      </header>

      <form className={styles.search} method="get">
        <label className={styles.label} htmlFor="q">
          A phone number, in any shape
        </label>
        <div className={styles.row}>
          <input
            className={styles.input}
            id="q"
            name="q"
            defaultValue={asked}
            placeholder="+351 912 345 678 · 912345678 · 00351912345678"
            autoComplete="off"
          />
          <button className={styles.go} type="submit">
            Find
          </button>
        </div>
        {asked && (
          <p className={styles.miss}>
            <b>{asked}</b> is not a phone number we can read. It has not been guessed at — a repaired number would
            look exactly like a correct lookup that found nobody.
          </p>
        )}
      </form>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>Something needs doing</h2>
          <span className={styles.answers}>
            an unresolved send, a refusal in the last {attention?.windowDays ?? 7} days, or a quarantined claim
          </span>
          {attention && attention.rows.length > 0 && <span className={styles.count}>{attention.rows.length}</span>}
        </header>

        {attention === null ? (
          <StateSurface meaning="red" className={styles.empty}>
            {
              whyEmpty({
                state: 'readFailed',
                thing: 'contacts with something wrong',
                threw: 'the read did not return',
              }).sentence
            }
          </StateSurface>
        ) : attention.rows.length === 0 ? (
          <StateSurface meaning="through" className={styles.empty}>
            {
              whyEmpty({
                state: 'resting',
                thing: 'contacts with something wrong',
                scope: `for ${client.name}`,
                welcome: true,
              }).sentence
            }
          </StateSurface>
        ) : (
          <div className={styles.rows}>
            {attention.capped && (
              /* 🔒 "At least", not "this many". The two are different facts. */
              <p className={styles.capped}>
                Showing {ATTENTION_CAP}. There are <b>more than</b> that — this is a cap, not a total.
              </p>
            )}
            {attention.rows.map((r) => (
              <Link className={styles.contact} href={contactHref(clientId, r.e164)} key={r.e164}>
                <span className={styles.number}>{r.e164}</span>
                <span className={styles.reasons}>
                  {r.reasons.map((reason) => (
                    <StateChip
                      meaning={reason === 'unresolved_send' ? 'grey' : reason === 'recent_refusal' ? 'held' : 'red'}
                      key={reason}
                    >
                      {REASON_MEANS[reason]}
                    </StateChip>
                  ))}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>It does not list every contact. There is no way to browse an agency&rsquo;s numbers from here.</p>
        <p>
          It does not rank anybody by how active or how valuable they are. A contact appears only because something
          about them needs doing.
        </p>
        <p>No number is created, edited or deleted here.</p>
      </div>
    </>
  )
}
