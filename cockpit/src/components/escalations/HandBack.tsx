import { handBackFromEscalations } from '@/lib/escalations/actions'
import styles from '@/app/c/[client]/escalations/escalations.module.css'

/**
 * Handing ONE lead back to the AI, under its row on /c/<client>/escalations
 * (§5.3's explicit hand-back; 22 Sep 2026). A server component: the form posts
 * to a server action, so there is no client island and no pending state to get
 * wrong — the navigation IS the feedback.
 *
 *   🔒 ASKED TWICE, NAMING THE LEAD, with nothing ticked in advance, and
 *      lib/escalations/actions.ts refuses the act if the box does not come
 *      back. A form that only asks in the browser is asking nobody.
 *   🔒 BESIDE THE ROW, NOT INSIDE IT: the row is a link, a form inside an <a>
 *      is invalid, and its clicks would navigate instead of submitting.
 *   🔒 STILL NO BULK HAND-BACK. One lead, or the one you had not read yet goes
 *      with the rest.
 *   🔒 CLOSED BY DEFAULT: the screen's job is who is waiting; this is a
 *      decision you open on purpose.
 */
export function HandBack({ leadId, clientId, name }: { leadId: string; clientId: string; name: string }) {
  return (
    <details className={styles.handback}>
      <summary>Hand back to the AI</summary>
      <form action={handBackFromEscalations} className={styles.handbackForm}>
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="clientId" value={clientId} />
        <p className={styles.handbackAsk}>
          Hand {name} back to the AI? It will answer their next message, and it will not know what was discussed anywhere but here.
        </p>
        <label className={styles.handbackYes}>
          <input type="checkbox" name="confirm" value="yes" required /> Yes, hand {name} back
        </label>
        <button type="submit" className={styles.handbackGo}>Hand back</button>
      </form>
    </details>
  )
}
