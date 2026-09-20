/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "NOTHING" IS NEVER ONE THING.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * docs/cockpit-build-plan.md §5. A screen that renders nothing must be readable
 * as correct rather than broken, and the way it becomes readable is that the
 * emptiness says WHICH emptiness it is. There are five, they mean different
 * things to the person reading, and collapsing any two is the defect:
 *
 *   resting      it ran, and there was nothing           (S1)
 *   never        it has never happened                    (S2)
 *   notChecked   nobody looked, or the look is pending    (S3)
 *   refused      something is stopping it, and it is named (S5)
 *   readFailed   we looked and the read threw             (S4)
 *
 * WHY THIS IS A MODULE AND NOT A HABIT. Every screen would otherwise word its
 * own emptiness, and two screens would word the same emptiness differently —
 * which is the class of defect that produced automation 04 rendered as running
 * on one screen while the screen next to it refused every property. The frames
 * live here; the screen supplies its own nouns.
 *
 * WHAT THE COLOUR IS, and it is not a free choice (brief §0.5):
 *   - resting is green ONLY where an empty queue is genuinely good news, and
 *     grey otherwise. An empty list is not an achievement everywhere.
 *   - never, and notChecked, are GREY. 🔒 Uncertainty and absence are never
 *     coloured — colouring them asserts something the system does not know.
 *   - refused is blue: a rule held it back, which is a decision, not an error.
 *   - readFailed is red: a read that failed is broken.
 *
 * 🔴 notChecked is grey and NOT amber. Amber means a clock is the reason, and
 * "nobody has looked" has no clock in it. Corrected 20 September 2026, against
 * the Stage B settings design, which drew the unprobed calendar in amber.
 *
 * This module is operator-facing English. The agency-facing screens are
 * Portuguese and their four states live in their own copy modules
 * (EXEMPTION, MATCHES, LISTINGS, NOTICE) — same five states, same rule that no
 * two may be worded alike, asserted by the same test.
 */

export type Tone = 'through' | 'held' | 'grey' | 'red'

export type Emptiness =
  | {
      state: 'resting'
      /** The plural thing that is absent: "escalations", "anomalies". */
      thing: string
      /** The window or scope the claim is about: "in the last 7 days". */
      scope?: string
      /** True only where an empty list is good news — the escalation queue. */
      welcome?: boolean
      /** "the last hand-over cleared at 08:41" */
      lastly?: string
    }
  | {
      state: 'never'
      /** Whose history is empty: "this client". */
      owner: string
      /** What has never happened: "a lead". */
      thing: string
      /** "onboarded 5 September 2026" */
      since?: string
    }
  | {
      state: 'notChecked'
      /** What was not checked: "the calendar", "Wednesday". */
      thing: string
      /** Why nobody has looked, or why the look has not landed. */
      why: string
      /** The claim this is NOT, so the two can never be read as one. */
      notTheSameAs: string
    }
  | {
      state: 'refused'
      thing: string
      /** What is stopping it, named: "Meta has not verified the business". */
      by: string
    }
  | {
      state: 'readFailed'
      thing: string
      /** The thrown sentence, as stored. Rendered in mono by the caller. */
      threw: string
    }

export type WhyEmpty = {
  sentence: string
  tone: Tone
  /** Whether the screen should offer to run the thing again. */
  offersRetry: boolean
  /** For the accessible name and for tests: which of the five this is. */
  state: Emptiness['state']
}

export function whyEmpty(e: Emptiness): WhyEmpty {
  switch (e.state) {
    case 'resting': {
      const scope = e.scope ? ` ${e.scope}` : ''
      const welcome = e.welcome
        ? ' This is the resting state, and it is the one you want.'
        : ''
      const lastly = e.lastly ? ` ${sentenceCase(e.lastly)}.` : ''
      return {
        sentence: `No ${e.thing}${scope}.${welcome}${lastly}`,
        tone: e.welcome ? 'through' : 'grey',
        offersRetry: false,
        state: 'resting',
      }
    }
    case 'never': {
      const since = e.since ? ` (${e.since})` : ''
      return {
        // Deliberately a different shape from resting, not a different adverb.
        // "No escalations" and "has never had a lead" cannot be misread as each
        // other; "no escalations yet" and "no escalations" can.
        sentence: `${sentenceCase(e.owner)} has never had ${e.thing}${since}.`,
        tone: 'grey',
        offersRetry: false,
        state: 'never',
      }
    }
    case 'notChecked':
      return {
        sentence: `We have not checked ${e.thing}: ${e.why}. This is not ${e.notTheSameAs} — it is that we do not know.`,
        tone: 'grey',
        offersRetry: true,
        state: 'notChecked',
      }
    case 'refused':
      return {
        sentence: `${sentenceCase(e.thing)} is held: ${e.by}.`,
        tone: 'held',
        offersRetry: false,
        state: 'refused',
      }
    case 'readFailed':
      return {
        // 🔒 It must not say the list is empty. Until it reads, assume it is not.
        sentence: `${sentenceCase(e.thing)} could not be read, so this page is not saying there is nothing.`,
        tone: 'red',
        offersRetry: true,
        state: 'readFailed',
      }
  }
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
