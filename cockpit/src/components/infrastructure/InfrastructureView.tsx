import type { Infrastructure, InfrastructureStanding } from '@/lib/infrastructure/model'
import { absoluteTime } from '@/lib/infrastructure/model'
import { BETTER_STACK_LINK } from '@/lib/infrastructure/monitor'
import { StateChip, StateMark, StateSurface, type Meaning } from '@/components/state-chip'
import styles from './infrastructure.module.css'

/**
 * /ops/infrastructure, drawn (brief §2.4, Q4; moved from /health, 22 Sep 2026).
 *
 *   🔒 THE STAMP IS THE BIGGEST THING ON THE PAGE, absolute beside relative,
 *      and the page says when IT rendered: a relative time on a screen left
 *      open overnight says "5 minutes ago" for twelve hours.
 *   🔒 STALE IS LOUDER THAN THE CHECKS (S8). Green rows under a stale stamp are
 *      not a green system; they are yesterday's answer.
 *   🔴 S3: "we could not ask the monitor" never renders as "the monitor says
 *      nothing is wrong". The not-asked line is red and says what failed.
 *   🔴 THE COUNT IS A NUMBER FROM THE ROW, never a word in a sentence.
 *   🔒 data-standing and data-check exist for tests/probe-health.ts: the CSS
 *      module class names are hashed in the build, so the probe counts a stable
 *      attribute rather than a class that moves whenever this file does.
 *   🔒 NO RE-RUN BUTTON, and no rebuilt Better Stack dashboard: one line and a
 *      link through. This screen reads.
 */

const MEANING: Record<InfrastructureStanding, Meaning> = {
  green: 'through', failing: 'red', stale: 'red', never: 'grey', readFailed: 'red',
}
const WORD: Record<InfrastructureStanding, string> = {
  green: 'all passing', failing: 'failing', stale: 'not current', never: 'never run', readFailed: 'not read',
}

export function InfrastructureView({ infra }: { infra: Infrastructure }) {
  const { stamp, checks, monitor } = infra
  const loud = infra.standing !== 'green'
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Infrastructure</h1>
        <p className={styles.lede}>
          Is the system alive, and is the thing that watches it alive? You are here to confirm something, not to discover it: Better Stack emails first, and this screen only reads.
        </p>
      </header>

      {/* 🔒 The stamp, and the standing beside it: the whole screen in one block. */}
      <section className={`${styles.stamp} ${loud ? styles.stampLoud : ''}`} data-standing={infra.standing}>
        <div className={styles.stampMain}>
          <span className={styles.eyebrow}>Last run</span>
          <span className={styles.stampAbs}>{stamp.absolute ?? (infra.standing === 'readFailed' ? 'Not read' : 'Never')}</span>
          {stamp.relative && (
            <span className={styles.stampRel}>
              {stamp.relative}
              {stamp.durationMs !== null ? ` · took ${(stamp.durationMs / 1000).toFixed(1)}s` : ''}
              {stamp.host ? ` · ${stamp.host}` : ''}
            </span>
          )}
        </div>
        <div className={styles.stampSide}>
          <StateChip meaning={MEANING[infra.standing]}>{WORD[infra.standing]}</StateChip>
          <span className={styles.rendered}>This page rendered {absoluteTime(stamp.renderedAt)}</span>
        </div>

        {/*
          * 🔒 THE STANDING'S SENTENCE SITS INSIDE THE STAMP, not below it. When
          * the run is stale, "it is telling you nothing" belongs to the time
          * above it rather than floating as a separate remark — which is what
          * keeps staleness the loudest thing on the page.
          */}
        <StateSurface meaning={MEANING[infra.standing]} className={styles.says}>{infra.says}</StateSurface>
      </section>

      {/* 🔴 §4.9: ONE line about the monitor, and a link. Never its dashboard. */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>The monitor outside</h2>
        <StateSurface meaning={monitor.asked ? (monitor.allUp ? 'through' : 'red') : 'red'} className={styles.says}>
          {monitor.says}
        </StateSurface>
        <p className={styles.note}>
          Asked {absoluteTime(monitor.askedAt)}. <a className={styles.link} href={BETTER_STACK_LINK} target="_blank" rel="noreferrer">Better Stack has the history, the incidents and the uptime</a>; this line is only whether it is watching.
        </p>
      </section>

      {checks.total > 0 && (
        <section className={styles.section}>
          {/* 🔴 The number comes from the row. A word here goes out of date in silence. */}
          <h2 className={styles.sectionTitle}>
            The checks<span>{checks.total} published · {checks.failed.length} failing</span>
          </h2>
          {/*
            * 🔒 A MARK PER CHECK, so passing and failing read at a glance
            * instead of by reading every line — and the mark is the SAME one
            * every other screen uses for that state. No icon per check TYPE: a
            * container icon beside "container ryvo-n8n is running" decorates
            * the words it repeats.
            * 🔒 Every check's words are the producer's, unchanged.
            */}
          <ul className={styles.checks}>
            {checks.failed.map((c) => (
              <li key={c} data-check="failing" className={`${styles.check} ${styles.checkBad}`}>
                <StateMark meaning="red" label="failing" />
                <span className={styles.checkText}>{c}</span>
                <StateChip meaning="red">failing</StateChip>
              </li>
            ))}
            {checks.passed.map((c) => (
              <li key={c} data-check="passing" className={styles.check}>
                <StateMark meaning="through" label="passing" />
                <span className={styles.checkText}>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.note}>
        {/* 🔴 The self-reference, said in words so a stale stamp reads as the design. */}
        One of the checks is “Supabase reachable”, and this screen is served from Supabase. So a Supabase outage cannot appear here as a red row — it appears as the last-run time above going stale, which is why staleness is the loudest thing here. Email is the channel that does not depend on what it watches.
      </p>
      <p className={styles.note}>
        There is no re-run here. The check runs from cron on the server every 10 minutes, and a button on this page would either do nothing or build a second way to trigger a thing whose value is that it runs on a schedule outside the app.
      </p>
    </div>
  )
}
