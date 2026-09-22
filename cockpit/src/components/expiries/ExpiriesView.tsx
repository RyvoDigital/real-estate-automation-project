import { randomUUID } from 'node:crypto'
import type { Expiries, ExpiryItem, ExpiryStanding, ObligationCurrent } from '@/lib/expiries/model'
import { OBLIGATION_REFUSALS } from '@/lib/expiries/copy'
import { recordObligationAction } from '@/lib/expiries/obligations-actions'
import { say, type Refusal } from '@/lib/refusals'
import { operatorName } from '@/lib/operators'
import { StateChip, StateSurface, type Meaning } from '@/components/state-chip'
import styles from './expiries.module.css'

/**
 * /ops/expiries, drawn (brief §2.3; C5, checkpoint 2, 22 Sep 2026). The
 * operator's own screen, in the cockpit frame, in The Month's direction.
 *
 *   🔒 FOUR AXES THAT DO NOT MERGE: Ryvo's own (every item, good ones too), then
 *      run out, about to run out, to confirm, each by its own clock.
 *   🔒 EVERY FAILED READ AND EVERY UN-CHECKED CAUSE IS SAID (S3, S4), never
 *      rendered as a clean list.
 *   🔒 EVERY WRITE FORM CARRIES ITS OWN ID, minted HERE when it is drawn.
 *   🔒 A renewal or correction starts EMPTY, the current values beside it.
 *      "Checked, nothing changed" re-states the current values on purpose:
 *      that re-statement IS the act.
 *   🔒 RETIRING IS ASKED TWICE, naming the obligation: it is the one act no
 *      later record can undo. Everything else stays one click.
 *   🔴 NO CARD NUMBER is asked for, shown or accepted: brand, last four,
 *      month/year and the services behind it.
 */

const MEANING: Record<ExpiryStanding, Meaning> = {
  past: 'red', not_valid: 'red', soon: 'clock', unknown: 'grey', to_confirm: 'grey', good: 'through', no_expiry: 'grey',
}
const WORD: Record<ExpiryStanding, string> = {
  past: 'run out', not_valid: 'not valid', soon: 'soon', unknown: 'not asserted', to_confirm: 'to confirm', good: 'in force', no_expiry: 'no expiry stated',
}
const KIND_WORD: Record<string, string> = {
  deploy_key: 'deploy key', domain: 'domain', certidao: 'certidão', procuracao: 'procuração', payment_card: 'card',
  property_document: 'document', registration: 'registration', clearance: 'clearance',
}
const CAUSE: Record<string, string> = {
  certificate_expired: 'the certificate expired', registration_revoked: 'a registration was revoked or suspended',
  requirement_arrived: 'a new requirement now applies', requirement_unresolvable: 'the requirement can no longer be resolved',
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const when = (x: ExpiryItem) =>
  x.days === null ? (x.date ? day(x.date) : null) : x.days < 0 ? `${-x.days} day${x.days === -1 ? '' : 's'} ago` : x.days === 0 ? 'today' : `in ${x.days} day${x.days === 1 ? '' : 's'}`
const whose = (x: ExpiryItem) => (x.owner.kind === 'ryvo' ? 'Ryvo' : x.owner.name)

function Row({ x, children }: { x: ExpiryItem; children?: React.ReactNode }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowTitle}>{x.what}</span>
        <span className={styles.rowLine}>
          {KIND_WORD[x.kind]} · {whose(x)}{x.date && x.days !== null ? ` · ${day(x.date)}` : ''}
          {x.note ? ` · ${x.note}` : ''}
        </span>
        {x.causes && x.causes.length > 0 && (
          // 🔒 every cause, each its own sentence: never the first found
          <ul className={styles.causes}>{x.causes.map((c) => <li key={c}>{CAUSE[c] ?? c}</li>)}</ul>
        )}
        {children}
      </div>
      <div className={styles.aside}>
        {when(x) && <b>{when(x)}</b>}
        <StateChip meaning={MEANING[x.standing]}>{WORD[x.standing]}</StateChip>
      </div>
    </li>
  )
}

/** The hidden fields that carry one act; the id is minted here, per drawn form. */
function Hidden({ act, o }: { act?: string; o?: ObligationCurrent }) {
  return (
    <>
      <input type="hidden" name="actId" value={randomUUID()} />
      {act && <input type="hidden" name="act" value={act} />}
      {o && <input type="hidden" name="obligationId" value={o.obligation_id} />}
      {o && <input type="hidden" name="supersedesId" value={o.id} />}
      {o && <input type="hidden" name="kind" value={o.kind} />}
    </>
  )
}

/** The fields one kind asks for. EMPTY: `current` is shown beside, never inside. */
function KindFields({ kind, current }: { kind: 'certidao' | 'procuracao' | 'payment_card'; current?: ObligationCurrent }) {
  const now = (text: string | null | undefined) => (current ? <span className={styles.ref}>now: {text || '—'}</span> : null)
  return (
    <div className={styles.fields}>
      <label className={styles.field}><span>Name</span><input name="label" className={styles.input} autoComplete="off" />{now(current?.label)}</label>
      {kind !== 'payment_card' && (
        <label className={styles.field}><span>{kind === 'certidao' ? 'Válida até' : 'Expires on'}</span>
          <input name="expiresOn" type="date" className={styles.input} />{now(current?.expires_on ? day(current.expires_on) : current?.no_expiry_stated ? 'no expiry stated' : null)}</label>
      )}
      {kind === 'procuracao' && (
        <fieldset className={styles.pair}>
          <legend>Does the document state an expiry?</legend>
          {/* Two answers, neither chosen: "no expiry stated" is said, never assumed. */}
          <label className={styles.choice}><input type="radio" name="noExpiryStated" value="no" /> Yes: the date above</label>
          <label className={styles.choice}><input type="radio" name="noExpiryStated" value="yes" /> No: it states no expiry</label>
        </fieldset>
      )}
      {kind === 'payment_card' && (
        <>
          <label className={styles.field}><span>Brand</span><input name="cardBrand" className={styles.input} autoComplete="off" />{now(current?.card_brand)}</label>
          {/* 🔴 The last four ONLY: maxLength and the pattern say so, and 0058 refuses anything longer anywhere. */}
          <label className={styles.field}><span>Last four digits</span><input name="cardLastFour" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" className={styles.input} autoComplete="off" />{now(current?.card_last_four)}</label>
          <label className={styles.field}><span>Expiry month</span><input name="cardExpMonth" inputMode="numeric" maxLength={2} className={styles.input} autoComplete="off" />{now(current?.card_exp_month ? String(current.card_exp_month) : null)}</label>
          <label className={styles.field}><span>Expiry year</span><input name="cardExpYear" inputMode="numeric" maxLength={4} className={styles.input} autoComplete="off" />{now(current?.card_exp_year ? String(current.card_exp_year) : null)}</label>
          <label className={`${styles.field} ${styles.wide}`}><span>Services charged to it, one per line</span><textarea name="services" rows={3} className={styles.input} />{now(current?.services?.join(', '))}</label>
        </>
      )}
      <label className={`${styles.field} ${styles.wide}`}><span>Note</span><input name="note" className={styles.input} autoComplete="off" /></label>
    </div>
  )
}

/** "Checked, nothing changed": the current values re-stated, which is the act. */
function CheckedForm({ o }: { o: ObligationCurrent }) {
  return (
    <form action={recordObligationAction} className={styles.inline}>
      <Hidden act="checked" o={o} />
      <input type="hidden" name="label" value={o.label} />
      {o.expires_on && <input type="hidden" name="expiresOn" value={o.expires_on} />}
      {o.kind === 'procuracao' && <input type="hidden" name="noExpiryStated" value={o.no_expiry_stated ? 'yes' : 'no'} />}
      {o.kind === 'payment_card' && (
        <>
          <input type="hidden" name="cardBrand" value={o.card_brand ?? ''} />
          <input type="hidden" name="cardLastFour" value={o.card_last_four ?? ''} />
          <input type="hidden" name="cardExpMonth" value={String(o.card_exp_month ?? '')} />
          <input type="hidden" name="cardExpYear" value={String(o.card_exp_year ?? '')} />
          <input type="hidden" name="services" value={(o.services ?? []).join('\n')} />
        </>
      )}
      <button type="submit" className={styles.ghost}>Checked: nothing changed</button>
    </form>
  )
}

/** The obligation, named the way the operator would say it, for the retire question. */
function nameOf(o: ObligationCurrent): string {
  return o.kind === 'payment_card' && o.card_last_four ? `the ${o.card_brand} ending ${o.card_last_four}` : `“${o.label}”`
}

function ObligationActions({ o }: { o: ObligationCurrent }) {
  return (
    <div className={styles.acts}>
      <span className={styles.last}>last {o.act} {day(o.recorded_at)}, by {operatorName(o.recorded_by) ?? o.recorded_by}</span>
      <CheckedForm o={o} />
      <details className={styles.more}>
        <summary>Renew or correct</summary>
        <form action={recordObligationAction} className={styles.form}>
          {/* no hidden act: the radios below are the act, and nothing defaults it */}
          <Hidden o={o} />
          <fieldset className={styles.pair}>
            <legend>Which is it?</legend>
            {/* The act is chosen, not defaulted: a renewal and a correction are different facts. */}
            <label className={styles.choice}><input type="radio" name="act" value="renewed" required /> A renewal: a new date</label>
            <label className={styles.choice}><input type="radio" name="act" value="corrected" required /> A correction: a value was wrong</label>
          </fieldset>
          <KindFields kind={o.kind} current={o} />
          <button type="submit" className={styles.primary}>Record</button>
        </form>
      </details>
      <details className={styles.more}>
        <summary>Retire</summary>
        <form action={recordObligationAction} className={styles.form}>
          <Hidden act="retired" o={o} />
          <input type="hidden" name="label" value={o.label} />
          {/*
            * 🔒 THE SECOND STEP, and the only one on this screen. Every other act
            * is undone by recording the truth afterwards; a retirement is not.
            * So it is asked again, NAMING the obligation, in a box nothing ticks
            * in advance and nothing focuses — and obligations-core refuses the
            * act if the box did not come back ticked.
            */}
          <p className={styles.confirmAsk}>
            Retire {nameOf(o)}? It leaves the list and cannot be brought back; you would enter it again as a new obligation.
          </p>
          <label className={styles.choice}><input type="checkbox" name="confirm" value="yes" required /> Yes, retire {nameOf(o)}</label>
          <label className={`${styles.field} ${styles.wide}`}><span>Why (cancelled, revoked, replaced…)</span><input name="note" className={styles.input} autoComplete="off" /></label>
          <button type="submit" className={styles.ghost}>Retire it</button>
        </form>
      </details>
    </div>
  )
}

function AddForm({ kind, title }: { kind: 'certidao' | 'procuracao' | 'payment_card'; title: string }) {
  return (
    <details className={styles.more}>
      <summary>{title}</summary>
      <form action={recordObligationAction} className={styles.form}>
        <Hidden act="entered" />
        <input type="hidden" name="kind" value={kind} />
        <KindFields kind={kind} />
        <button type="submit" className={styles.primary}>Record</button>
      </form>
    </details>
  )
}

function List({ title, sub, items, empty }: { title: string; sub: string; items: ExpiryItem[]; empty: string }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}<span>{items.length} · {sub}</span></h2>
      {items.length ? <ul className={styles.rows}>{items.map((x) => <Row key={x.key} x={x} />)}</ul> : <p className={styles.empty}>{empty}</p>}
    </section>
  )
}

export function ExpiriesView({ e, refusal, guardado, jaGuardado }: {
  e: Expiries; refusal?: Refusal | null; guardado?: string; jaGuardado?: string
}) {
  const c = e.checked
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Expiries</h1>
        <p className={styles.lede}>What has run out, what is about to, and what needs confirming, across every client, and Ryvo&rsquo;s own. Nothing here acts on the outside world.</p>
      </header>

      {refusal && <StateSurface meaning="red" className={styles.banner}><b>{say(OBLIGATION_REFUSALS, 'en', refusal)}</b></StateSurface>}
      {guardado && <StateSurface meaning="through" className={styles.banner}>Recorded.</StateSurface>}
      {jaGuardado && <StateSurface meaning="through" className={styles.banner}>That was already recorded. Nothing new was written.</StateSurface>}

      {e.failures.length > 0 && (
        <StateSurface meaning="red" className={styles.banner}>
          <b>Some of this could not be read, so the lists below are not complete.</b>
          <ul>{e.failures.map((f) => <li key={f}>{f}</li>)}</ul>
        </StateSurface>
      )}
      {e.notCheckedFor.length > 0 && (
        // S3: the state this screen exists to render. What was NOT looked for, never a clean bill.
        <StateSurface meaning="red" className={styles.banner}>
          <b>These clearances were re-checked without everything the check needs, so some causes were not looked for:</b>
          <ul>{e.notCheckedFor.map((n) => <li key={n.client}>{n.client}: {n.causes.map((x) => CAUSE[x] ?? x).join('; ')}</li>)}</ul>
        </StateSurface>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Ryvo&rsquo;s own<span>{e.ryvoOwn.length} · soonest first · never shown to a client</span></h2>
        <ul className={styles.rows}>
          {e.ryvoOwn.map((x) => <Row key={x.key} x={x}>{x.obligation && <ObligationActions o={x.obligation} />}</Row>)}
        </ul>
        <div className={styles.adds}>
          <AddForm kind="certidao" title="Add the certidão permanente" />
          <AddForm kind="procuracao" title="Add a procuração" />
          <AddForm kind="payment_card" title="Add a payment card" />
        </div>
      </section>

      <List title="Run out" sub="most overdue first" items={e.runOut} empty="Nothing tracked has run out." />
      <List title="About to run out" sub={`within ${e.warnWithinDays} days, fewest days left first`} items={e.aboutTo} empty={`Nothing tracked runs out within ${e.warnWithinDays} days.`} />
      <List title="To confirm" sub="registrations, never checked first" items={e.toConfirm} empty="No registration waits to be confirmed." />

      <p className={styles.note}>
        {/* S1: with N, never a bare "all clear". */}
        Checked {c.clearances} clearance{c.clearances === 1 ? '' : 's'} ({c.stillGoodClearances} still good), {c.documents} document{c.documents === 1 ? '' : 's'} and {c.registrations} registration{c.registrations === 1 ? '' : 's'} across {c.clients} client{c.clients === 1 ? '' : 's'}, and {c.obligations} of Ryvo&rsquo;s own. Not tracked yet: {e.notTracked.join('; ')}.
      </p>
    </div>
  )
}
