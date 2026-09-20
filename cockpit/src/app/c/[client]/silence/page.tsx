import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readSilence } from '@/lib/matching/silence-read'
import { whyEmpty } from '@/lib/why-empty'
import { StateSurface } from '@/components/state-chip'
import styles from './silence.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SILENCE — Q19: who told this agency what they wanted, and was left alone?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §8.
 *
 * 🔒 THE PRODUCT'S ARGUMENT IN ONE SENTENCE, MADE FROM DATA THAT ALREADY
 * EXISTS — before any threshold is configured, before Meta approves anything,
 * and before a single message goes out. It is the one screen that works today.
 *
 * 🔴 CAN DO: NOTHING. There is no button, and its absence IS the design.
 * Reaching these people is consent-gated and paced, and a "contact them all"
 * control on a screen designed to produce indignation is how an agency's
 * database gets burned in an afternoon.
 *
 * 🔒 THE DENOMINATOR IS ALWAYS ON THE SCREEN, and the two counts that are not
 * in the headline sit BESIDE it rather than folded in. Folding either one in
 * would inflate the number this screen exists to make somebody feel.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Silence({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  let s: Awaited<ReturnType<typeof readSilence>> | null = null
  let threw = ''
  try {
    s = await readSilence(clientId)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }

  if (!s) {
    return (
      <>
        <h1 className={styles.title}>The silence</h1>
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'this client’s contacts', threw }).sentence}
        </StateSurface>
      </>
    )
  }

  // 🔒 Everyone who ever told this agency something. The denominator.
  const toldUs = s.silent.length + s.unknownClock + s.recentlySpoken

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>The silence</h1>
          <p className={styles.sub}>
            {client.name} · who told them what they wanted, and has been left alone since. Nothing on this page sends
            anything, and nothing here is a list to work through.
          </p>
        </div>
        <span className={styles.stamp}>
          <span>Silent past</span>
          <b>{s.thresholdDays} days</b>
          <span>decides who appears, never whether anything is sent</span>
        </span>
      </header>

      {toldUs === 0 ? (
        /*
         * 🔴 S2 — nobody ever said anything. A DIFFERENT SENTENCE from S1, and
         * this screen is where that distinction was first got right: "nobody
         * has told us what they want" and "everyone who told us has been spoken
         * to" are opposite findings and would otherwise share a page.
         */
        <StateSurface meaning="grey" className={styles.empty}>
          {whyEmpty({ state: 'never', owner: 'this agency', thing: 'anybody telling them what they were looking for' }).sentence}{' '}
          There is no silence to measure yet — this is the state before the work, not a result of it.
          {s.saidNothing > 0 && (
            <span className={styles.aside}>
              {s.saidNothing} contact{s.saidNothing === 1 ? ' is' : 's are'} held with nothing spoken from them. They
              are not this screen&rsquo;s subject.
            </span>
          )}
        </StateSurface>
      ) : s.silent.length === 0 ? (
        // S1 — people spoke, and none are silent past the threshold.
        <StateSurface meaning="through" className={styles.empty}>
          {
            whyEmpty({
              state: 'resting',
              thing: 'people left alone',
              scope: `past ${s.thresholdDays} days`,
              welcome: true,
            }).sentence
          }{' '}
          {toldUs} {toldUs === 1 ? 'person' : 'people'} told this agency what they wanted, and every one of them has
          been spoken to inside the threshold.
        </StateSurface>
      ) : (
        <>
          <section className={styles.headline}>
            <div className={styles.big}>
              <span className={styles.bigN}>{s.silent.length}</span>
              <span className={styles.bigL}>
                of <b>{toldUs}</b> who told this agency what they wanted have heard nothing for {s.thresholdDays} days
                or more
              </span>
            </div>

            {/* 🔒 BESIDE, not folded in. Each of these would inflate the
                headline, and the headline is the number this screen exists to
                make somebody feel. */}
            <div className={styles.beside}>
              <div className={styles.side}>
                <span className={styles.sideN}>{s.unknownClock}</span>
                <span className={styles.sideL}>
                  {/* 🔴 A THIRD THING. Not silent, not recent. */}
                  we do not know when anyone last spoke to them — not silent, not recent
                </span>
              </div>
              <div className={styles.side}>
                <span className={styles.sideN}>{s.recentlySpoken}</span>
                <span className={styles.sideL}>spoke inside the threshold — not a problem, and counted anyway</span>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2>Who they are</h2>
              {/* 🔒 NOT RANKED BY HOW SILENT. A list sorted by neglect is a
                  call-list wearing a report's clothes. */}
              <span className={styles.answers}>in no particular order — this is not a call list</span>
            </header>
            <div className={styles.rows}>
              {/*
                * 🔴 RE-ORDERED ON A NEUTRAL KEY, deliberately.
                *
                * `findSilence` returns `silent` sorted by days descending, and
                * argues for it: "the person left alone longest is the one the
                * agency should look at first." That is a call list, and §8
                * forbids it here in as many words — "a list sorted by neglect
                * is a call-list wearing a report's clothes."
                *
                * The library is not wrong to compute that order; the old
                * /silence screen uses it. This screen must not RENDER it, and
                * a caption saying "in no particular order" above a
                * neglect-ranked list would be the page lying about the one
                * property it is most load-bearing about.
                */}
              {[...s.silent]
                .sort((a, b) => (a.name ?? a.leadId).localeCompare(b.name ?? b.leadId))
                .map((l) => (
                <div className={styles.row} key={l.leadId}>
                  <span className={styles.name}>{l.name ?? 'a contact with no name recorded'}</span>
                  <span className={styles.days}>
                    {l.days} days
                    {/* The clock the number came from, so the figure can be
                        defended rather than trusted. */}
                    <span className={styles.since}>since {new Date(l.since).toLocaleDateString('en-GB')}</span>
                  </span>
                </div>
                ))}
            </div>
          </section>
        </>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          <b>There is no button here, and its absence is the design.</b> Reaching these people is consent-gated and
          paced. A &ldquo;contact them all&rdquo; control on a screen built to produce indignation is how an
          agency&rsquo;s database gets burned in an afternoon.
        </p>
        <p>No export as a mailing list, and no per-person &ldquo;contact&rdquo;.</p>
        <p>
          Nobody is ranked by how long they have been ignored. A list sorted by neglect is a call list wearing a
          report&rsquo;s clothes.
        </p>
        <p>
          It asks nothing about consent. Whether any of these people may be messaged is a question for the gate, at
          send time — answering it here would build a second, quieter gate out of a report.
        </p>
      </div>
    </>
  )
}
