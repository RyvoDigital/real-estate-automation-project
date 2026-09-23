import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { proposeGroups, describeContact } from '@/lib/segmentation/groups'
import { UI, SEGMENT_CHOICE, STATE_NOTE, STATE_LABEL, jurisdictionSentence, DECLARATION_REFUSALS } from '@/lib/segmentation/copy'
import { say, type Refusal } from '@/lib/refusals'
import { presentStep2 } from '@/lib/segmentation/present'
import { SURFACE } from '@/lib/segmentation/surface'
import type { ScreenData } from '@/lib/segmentation/read'
import { DeclareFlow } from '@/components/segmentation/DeclareFlow'
import styles from './segmentation.module.css'

/**
 * /segmentation/[clientId], drawn: everything the page shows, from what it read.
 * The page (app/segmentation/[clientId]/page.tsx) signs in and reads; this draws,
 * so the outside-Next preview renders the SAME markup (tests/render-segmentation-preview.tsx).
 *
 *   no ?grupo    every group as one row, with what the file suggests (as TEXT,
 *                never a selection) and a way in
 *   ?grupo=…     that group's two steps (DeclareFlow), the others one quiet line each
 *
 * 🔒 THE URL CARRIES THE GROUP, NEVER THE ANSWER. The chosen origin lives in the
 * form's own state (operator, 22 Sep 2026): a bookmarked or shared link opens the
 * group at its first question.
 * 🔒 THE DECLARATION ID IS MINTED HERE, per drawn form, and travels in it. The
 * same form sent twice is one act (0055); a reload draws a new form.
 * Every word comes from copy.ts; every colour from surface.ts.
 */

const muted = { color: SURFACE.page.muted }

export function SegmentationView({ clientId, screen, grupo, refusal, locale, guardado, jaGuardado }: {
  clientId: string
  screen: ScreenData
  grupo?: string
  /** what the last save refused, as a KEY: said here in the agency's language, never carried as a sentence */
  refusal?: Refusal | null
  /** clients.locale; the refusal's language */
  locale?: string | null
  guardado?: string
  jaGuardado?: string
}) {
  const groups = proposeGroups(screen.contacts)
  const byId = new Map(screen.contacts.map((c) => [c.id, c]))
  // From the policy table, never hardcoded: when the table changes the sentence changes.
  const jurisdiction = jurisdictionSentence(screen.jurisdictions)
  const openGroup = grupo ? groups.find((g) => g.id === grupo) ?? null : null

  return (
    <main className={styles.page} style={{ ...SURFACE.page }}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <h1 className={styles.title}>{UI.title}</h1>
          <p className={styles.intro} style={muted}>{UI.intro}</p>
        </header>

        {refusal && <p role="alert" className={styles.banner} style={{ ...SURFACE.error }}>{say(DECLARATION_REFUSALS, locale, refusal)}</p>}
        {guardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{UI.saved(Number(guardado))}</p>}
        {jaGuardado && <p role="status" className={styles.banner} style={{ ...SURFACE.ok }}>{UI.alreadySaved}</p>}

        <section className={styles.groups}>
          <h2 className={styles.label} style={muted}>{UI.groupHeading}</h2>
          {groups.map((g) => {
            const contacts = g.contactIds.map((id) => byId.get(id)!).filter(Boolean)
            const suggestion = g.proposal ? `${UI.proposalPrefix} ${g.proposal.why}. ${UI.proposalHint}` : UI.noProposal

            // One group at a time once a question is being answered: the others
            // are a line each, so the screen in front of the room holds one question.
            if (openGroup && openGroup.id !== g.id) {
              return <p key={g.id} className={styles.quiet} style={muted}>{g.label}</p>
            }
            if (!openGroup) {
              return (
                <div key={g.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <h3 className={styles.groupName}>{g.label}</h3>
                    <p className={styles.line} style={muted}>{suggestion}</p>
                  </div>
                  {/* The link reopens the GROUP. It carries no answer. */}
                  <Link className={styles.primary} href={`/segmentation/${clientId}?grupo=${encodeURIComponent(g.id)}`}>
                    {UI.answerGroup}
                  </Link>
                </div>
              )
            }

            // Step 2's words for each of the four answers, composed ONCE by present.ts
            // (the probe reads the same function); the form shows the one chosen.
            const views = {
              A: presentStep2({ contacts, segment: 'A', jurisdiction }),
              B: presentStep2({ contacts, segment: 'B', jurisdiction }),
              C: presentStep2({ contacts, segment: 'C', jurisdiction }),
              D: presentStep2({ contacts, segment: 'D', jurisdiction }),
            }
            return (
              <div key={g.id} className={styles.open}>
                <div className={styles.rowMain}>
                  <h3 className={styles.groupName}>{g.label}</h3>
                  <p className={styles.line} style={muted}>{suggestion}</p>
                </div>
                <DeclareFlow
                  clientId={clientId}
                  group={{ id: g.id, label: g.label }}
                  declarationId={randomUUID()}
                  views={views}
                  contacts={contacts.map((c) => {
                    const d = describeContact(c)
                    return { id: c.id, name: d.name, phone: d.phone, state: d.state, fromFile: c.claimRaw ? UI.fromFile(c.claimRaw) : null }
                  })}
                />
              </div>
            )
          })}
          {openGroup && <Link className={styles.back} href={`/segmentation/${clientId}`}>{UI.backToAll}</Link>}
        </section>

        {screen.history.length > 0 && (
          <section className={styles.history}>
            <h2 className={styles.label} style={muted}>{UI.historyHeading}</h2>
            <ul>
              {screen.history.map((h, i) => (
                <li key={i}>
                  <span>{h.phone} · {h.segment ? SEGMENT_CHOICE[h.segment as 'A'].label : STATE_LABEL.undetermined}</span>
                  <span style={muted}>
                    {h.declaredBy} · {new Date(h.recordedAt).toLocaleDateString('pt-PT')}
                    {` · ${h.group ? UI.declaredInGroup(h.group) : UI.declaredOneByOne}`}
                    {h.uncertain ? ` · ${UI.wasUnsure}` : ''}
                    {h.wording ? ` · «${h.wording}»` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {screen.contacts.length === 0 && <p className={styles.line} style={muted}>{UI.noContacts}</p>}

        {/* Only when somebody actually has: a note about a person who asked not
            to be contacted, on a screen where nobody did, describes nobody. */}
        {screen.contacts.some((c) => c.state === 'objected') && (
          <p className={styles.foot} style={muted}>
            {STATE_LABEL.objected}: {STATE_NOTE.objected}
          </p>
        )}
      </div>
    </main>
  )
}
