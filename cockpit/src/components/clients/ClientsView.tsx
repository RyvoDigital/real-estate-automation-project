import Link from 'next/link'
import type { ClientList, ClientRow, Count } from '@/lib/clients/model'
import { StateChip, StateMark, StateSurface } from '@/components/state-chip'
import styles from './clients.module.css'

/**
 * /CLIENTS, drawn (brief §1.2, §2.2; checkpoint 2, 23 Sep 2026).
 *
 *   🔒 WHO EXISTS, not what needs doing. Today is the worklist; this is the
 *      list, and it says its own order in one line so nobody has to guess.
 *   🔒 REHEARSALS APPEAR, MARKED, AND LAST. The opposite rule from Today and
 *      /ops/expiries, deliberately: those count the business's work, this one
 *      counts agencies.
 *   🔴 A FAILED READ SAYS SO, PER FIELD. "unknown" is a word on the row, never
 *      a zero, and the failures are named above the list.
 *   🔒 IT LISTS, IT DOES NOT ACT. Every row opens that client; there is no
 *      control here that sends, enables or contacts.
 *   🔒 COLOUR ONLY THROUGH THE STATE COMPONENTS (tokens.test.ts): a chip or a
 *      mark, each meaning one thing. Nothing here is coloured for emphasis.
 */

/** A count, or the word for a read that failed. Never 0 standing in for unknown. */
function Num({ n, one, many }: { n: Count; one: string; many: string }) {
  if (n === 'unknown') return <span className={styles.unknown}>not read</span>
  return <>{n} {n === 1 ? one : many}</>
}

function Row({ r }: { r: ClientRow }) {
  return (
    <li className={styles.row}>
      <Link className={styles.open} href={r.href}>
        <span className={styles.main}>
          <span className={styles.name}>
            {r.name}
            {/* 🔒 Marked, never hidden, and never "test": the word the operator answered. */}
            {r.standing === 'rehearsal' && <span className={styles.rehearsal}>rehearsal</span>}
            {r.standing === 'not_answered' && <span className={styles.rehearsal}>not answered</span>}
          </span>
          <span className={styles.line}>
            {r.automationsOn === 'unknown'
              ? <span className={styles.unknown}>what is on could not be read</span>
              : r.automationsOn === 0
                ? 'nothing switched on'
                : `${r.automationNames.join(' · ')}`}
            {' · '}
            {r.lastActivity === 'unknown'
              ? <span className={styles.unknown}>last activity not read</span>
              : r.lastActivity === null
                ? 'nothing has happened yet'
                : `last activity ${r.lastActivity.slice(0, 10)}`}
          </span>
        </span>

        <span className={styles.states}>
          {/* Each chip is one state, in the ranked order the row was sorted by. */}
          {r.waiting === 'unknown'
            ? <StateChip meaning="grey">waiting not read</StateChip>
            : r.waiting > 0 && <StateChip meaning="red"><Num n={r.waiting} one="waiting" many="waiting" /></StateChip>}
          {r.gateRefusingEverything === 'unknown'
            ? <StateChip meaning="grey">gate not read</StateChip>
            : r.gateRefusingEverything && <StateChip meaning="red">the gate refuses every contact</StateChip>}
          {r.runOut !== 'unknown' && r.runOut > 0 && <StateChip meaning="red"><Num n={r.runOut} one="run out" many="run out" /></StateChip>}
          {r.faults !== 'unknown' && r.faults > 0 && <StateChip meaning="red"><Num n={r.faults} one="fault" many="faults" /></StateChip>}
          {r.aboutTo !== 'unknown' && r.aboutTo > 0 && <StateChip meaning="clock"><Num n={r.aboutTo} one="about to" many="about to" /></StateChip>}
          {r.toConfirm !== 'unknown' && r.toConfirm > 0 && <StateChip meaning="grey"><Num n={r.toConfirm} one="to confirm" many="to confirm" /></StateChip>}
          {r.onboarded === 'unknown'
            ? <StateChip meaning="grey">onboarding not read</StateChip>
            : r.onboarded === false && <StateChip meaning="held">still being taken on</StateChip>}
          {r.attention === 'quiet' && <StateChip meaning="through">nothing outstanding</StateChip>}
        </span>
      </Link>
    </li>
  )
}

export function ClientsView({ list }: { list: ClientList }) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Clients</h1>
        <p className={styles.lede}>
          Every agency, and how each one is doing. This is who exists — what needs you right now is on Today.
        </p>
        {/* 🔒 The order, said out loud (operator's instruction, 23 Sep 2026). */}
        <p className={styles.order}>
          Most needing attention first; rehearsals last; then alphabetical.
        </p>
      </header>

      {list.failures.length > 0 && (
        <StateSurface meaning="red" className={styles.banner}>
          <b>Some of this could not be read, so the rows below are not complete.</b>
          <ul>{list.failures.map((f) => <li key={f}>{f}</li>)}</ul>
        </StateSurface>
      )}

      {list.empty ? (
        // 🔒 THE REAL EMPTY STATE. Never a sample agency: an empty cockpit is
        // shown to an agency as "you would be the first on it".
        <StateSurface meaning="grey" className={styles.empty}>
          <b>No agency yet.</b>
          <span>{list.empty}</span>
        </StateSurface>
      ) : (
        <ul className={styles.rows}>{list.rows.map((r) => <Row key={r.id} r={r} />)}</ul>
      )}

      {list.rows.length > 0 && (
        <p className={styles.note}>
          {list.totals.clients} agenc{list.totals.clients === 1 ? 'y' : 'ies'}
          {list.totals.rehearsals > 0 && `, of which ${list.totals.rehearsals} rehearsal${list.totals.rehearsals === 1 ? '' : 's'}`}
          {list.totals.notAnswered > 0 && `, and ${list.totals.notAnswered} where nobody has answered whether it is a rehearsal`}
          {'. '}
          Faults are counted over {list.faultWindowDays} days. The deploy gate&rsquo;s own client is not an agency and is not listed.
        </p>
      )}

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>Nothing here sends, enables or contacts anybody. Every row opens that client, where the doing is.</p>
        <p>
          No money: what each agency pays is The Month&rsquo;s, and a second place for those figures is a second set of
          figures.
        </p>
        <p><StateMark meaning="grey" label="unread" /> A figure that could not be read says so. It never shows as a zero.</p>
      </div>
    </div>
  )
}
