import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readSettings } from '@/lib/settings/read'
import { whyEmpty } from '@/lib/why-empty'
import { StateChip, StateSurface } from '@/components/state-chip'
import styles from './settings.module.css'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * CLIENT SETTINGS — what this client is configured to do, and what may change.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief III §12, and the screen the landing's "ours to fix" band points at.
 *
 * 🔒 A FIELD THAT CANNOT CHANGE HAS NO CONTROL, NOT A DISABLED ONE. This is the
 * operator's rule of 20 September, and it applies to every screen: a greyed
 * control still reads as one click from going, so the only honest version is no
 * control at all. `tests/settings-no-disabled.test.ts` asserts that nothing on
 * this page is `disabled`, `readOnly` or `aria-disabled`.
 *
 * 🔴 AND THE SAME RULE ONE LEVEL UP: an automation whose gate would refuse
 * everything has NO SWITCH — it has the refusal, what is holding it, and a
 * route there. A switch whose only effect is a refusal later is a switch that
 * teaches the operator the system is broken.
 *
 * 🔴 NO NUMBER HAS A DEFAULT, and the field says why. §0.3's sensible-defaults
 * rule is suspended here by §4.6, because `client_automations.config` holds
 * numbers that decide who receives a message.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const n = (v: unknown) => (typeof v === 'number' ? String(v) : typeof v === 'string' && v ? v : null)

/** A stored value, or the absence said in words. Never a control. */
function Value({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {value !== null ? (
        <span className={styles.value}>{value}</span>
      ) : (
        // 🔒 Not a dash and not a zero. §4.6: the absence says what is missing
        // and refuses to propose an answer.
        <span className={styles.unset}>not set — no default, on purpose</span>
      )}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

export default async function ClientSettings({ params }: { params: Promise<{ client: string }> }) {
  await requireOperator()
  const { client: clientId } = await params
  const clients = await getClients()
  const client = clients.find((c) => c.id === clientId)
  if (!client) notFound()

  const s = await readSettings(clientId)

  if (!s) {
    return (
      <>
        <h1 className={styles.title}>Settings</h1>
        <StateSurface meaning="red" className={styles.empty}>
          {whyEmpty({ state: 'readFailed', thing: 'this client’s configuration', threw: 'the read did not return' }).sentence}
        </StateSurface>
      </>
    )
  }

  const c = s.config

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.sub}>
            {client.name} · what this client is configured to do. <b>Nothing here is changed by opening it</b>, and
            nothing shown is a proposal.
          </p>
        </div>
        <span className={styles.stamp}>
          <span>Read</span>
          <b>{new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
          <span>not re-probed by opening</span>
        </span>
      </header>

      {/* ── what cannot change ─────────────────────────────────────────────── */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>Fixed once live</h2>
          <span className={styles.answers}>changed deliberately, elsewhere — not from a form</span>
        </header>
        <div className={styles.grid}>
          {s.frozen.map((f) => (
            <div className={styles.field} key={f.label}>
              <span className={styles.label}>{f.label}</span>
              {/* 🔒 Mono TEXT. Not a disabled input, not a readonly one. There
                  is no control here because there is nothing to press. */}
              {f.value ? <span className={styles.frozen}>{f.value}</span> : <span className={styles.unset}>not set</span>}
              <span className={styles.why}>{f.why}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── the Concierge's configuration ──────────────────────────────────── */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>What the Concierge reads</h2>
          <span className={styles.answers}>the keys the workflow actually uses</span>
        </header>

        {c === null ? (
          <StateSurface meaning="grey" className={styles.empty}>
            {whyEmpty({ state: 'never', owner: 'this client', thing: 'any configuration' }).sentence} Nothing runs
            until it is configured — an automation switched on with no working hours and no calendar is not a normal
            state.
          </StateSurface>
        ) : (
          <div className={styles.grid}>
            <Value label="Agency name" value={n(c.agency_name)} />
            <Value label="Assistant name" value={n(c.agent_name)} />
            <Value label="Timezone" value={n(c.timezone)} hint="every slot is computed in this zone" />
            <Value label="Default language" value={n(c.default_language)} hint="what a handoff falls back to" />
            <Value
              label="Areas served"
              value={Array.isArray(c.areas) && c.areas.length ? (c.areas as string[]).join(', ') : null}
            />
            <div className={styles.field}>
              <span className={styles.label}>Working hours</span>
              {s.workingHours ? (
                <>
                  <span className={styles.value}>
                    {s.workingHours.start}–{s.workingHours.end}
                  </span>
                  {/* 🔒 The PARSE shown back, not the text. What the engine
                      reads is what matters, and an end at or before the start
                      becomes a calendar that looks fully booked forever. */}
                  <span className={styles.parsed}>days {s.workingHours.days.join(',')} · as the engine reads it</span>
                </>
              ) : (
                <span className={styles.unset}>not set — no default, on purpose</span>
              )}
            </div>
            <Value
              label="Booking window"
              value={n(c.booking_window_days) && `${n(c.booking_window_days)} days`}
              hint="no default — say how many"
            />
            <Value
              label="Minimum notice"
              value={n(c.min_hours_notice) && `${n(c.min_hours_notice)} hours`}
              hint="no default — say how many"
            />
            <Value
              label="Introductory meeting — how long"
              value={n(c.viewing_duration_minutes) && `${n(c.viewing_duration_minutes)} minutes`}
              /* ⚠️ Recorded divergence: the stored key is viewing_duration_minutes
                 and the workflow reads it, so it cannot be renamed casually. The
                 screen uses the honest word and shows the key. */
              hint="stored as viewing_duration_minutes — it books an introductory meeting, not a property visit"
            />
            <Value label="High-value threshold" value={n(c.high_value_threshold_eur)} hint="no default — a judgement about their market" />
            <Value label="Escalate to" value={n(c.escalate_to)} hint="the number told when the AI stops" />
            <Value label="Calendar id" value={n(c.calendar_id)} />
          </div>
        )}
      </section>

      {/* ── the calendar's three answers ───────────────────────────────────── */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>The calendar</h2>
          <span className={styles.answers}>three answers, and they never collapse into two</span>
        </header>
        {/* 🔒 GREY, not amber. Amber means a clock is the reason; "nobody has
            looked" has no clock in it, and absence is never coloured (§0.5). */}
        <StateSurface meaning="grey" className={styles.empty}>
          <b>Nobody has looked.</b> {s.calendar.sentence}
          {'trap' in s.calendar && <span className={styles.trap}>{s.calendar.trap}</span>}
        </StateSurface>
      </section>

      {/* ── automations ───────────────────────────────────────────────────── */}
      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2>Automations</h2>
          <span className={styles.answers}>and whether each one’s gate would refuse everything today</span>
        </header>

        {s.automations === null ? (
          <StateSurface meaning="red" className={styles.empty}>
            {whyEmpty({ state: 'readFailed', thing: 'the automations', threw: 'the read did not return' }).sentence}
          </StateSurface>
        ) : (
          <div className={styles.autos}>
            {s.automations.map((a) => (
              <div className={styles.auto} key={a.key}>
                <span className={styles.autoName}>{a.name}</span>
                <StateChip meaning={a.status.tone}>{a.status.word}</StateChip>
                {a.status.heldBy ? (
                  /*
                   * 🔴 NO SWITCH. Its gate would refuse everything today, so a
                   * switch here would do nothing except produce a refusal
                   * later — which teaches the operator the system is broken.
                   * What it gets instead is the refusal, the thing holding it,
                   * and a route to that thing.
                   */
                  <span className={styles.held}>
                    held by its gate — {a.status.heldBy.what}
                    <Link className={styles.route} href={`/c/${clientId}`}>
                      what is holding it
                    </Link>
                  </span>
                ) : a.status.state === 'not_set_up' ? (
                  <span className={styles.held}>{a.status.missing.join('; ')}</span>
                ) : (
                  <span className={styles.switchGap}>
                    the switch is not built yet — enabling and disabling is still a database change
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={styles.absent}>
        <h2>What this page does not do</h2>
        <p>
          It does not edit matching thresholds. Those are the calibration, answered in the agency&rsquo;s own words,
          with nothing pre-filled — a settings form with a number already in it collects a click and records it as
          their judgement about their own market.
        </p>
        <p>It does not edit a declaration, an exemption, or anything else a person asserted. Those are append-only, with authors.</p>
        <p>It never confirms a policy row. Not from here, not from anywhere in the cockpit.</p>
        <p>No second WhatsApp number, and no deleting a client.</p>
        <p>
          It does not re-probe anything by being opened. Both computed answers carry the moment they were taken, and
          opening a page is not a reason to go and ask the world again.
        </p>
      </div>
    </>
  )
}
