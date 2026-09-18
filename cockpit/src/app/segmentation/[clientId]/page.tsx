import { requireOperator } from '@/lib/auth'
import { readScreen } from '@/lib/segmentation/read'
import { proposeGroups, describeContact, sharedClaimCell, type ContactRow, type Group } from '@/lib/segmentation/groups'
import { declareGroupAction } from '@/lib/segmentation/actions'
import {
  UI, SEGMENT_CHOICE, STATE_LABEL, STATE_NOTE, jurisdictionSentence,
} from '@/lib/segmentation/copy'
import { presentStep2 } from '@/lib/segmentation/present'
import { SURFACE } from '@/lib/segmentation/surface'

/**
 * TWO STEPS, AND THE ORDER IS THE WHOLE POINT.
 *
 *   step 1   where did these contacts come from?        (origin)
 *   step 2   given that answer, what is still needed?   (evidence, scoped)
 *
 * The first version asked both at once and in the wrong order: the question
 * about the file's consent marker sat ABOVE the question about who these people
 * are. A client who bought through the agency is segment A whether or not the
 * marker means anything, so the screen opened the conversation on something that
 * may be irrelevant — and opened a meeting on an admission of our error, which
 * is the right sentence in the wrong place. See CLAIM_SCOPE.
 *
 * Step 1 is a GET form: it writes nothing, carries its answer in the URL
 * (`?grupo=…&origem=…`), and is therefore back-buttonable and re-readable.
 * Only step 2 posts, and it posts once, so the record is still one action.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Secondary text always names the surface it sits on, so it cannot end up the
// wrong side of a background somebody changed.
const muted = { color: SURFACE.page.muted }
// The field is a surface too. It was rendering as dark grey on the white page,
// inherited from the same unpinned scheme as the radios.
const field = {
  ...SURFACE.page, width: '100%', padding: 8, marginTop: 6,
  border: '1px solid #b9b9b9', borderRadius: 6, fontSize: 16,
}
const mutedOnNote = { color: SURFACE.note.muted }
const card = { border: '1px solid #e4e4e4', borderRadius: 10, padding: 20, marginBottom: 18 }
const optionCard = {
  display: 'block', border: '1px solid #dcdcdc', borderRadius: 8,
  padding: '14px 16px', marginBottom: 12, cursor: 'pointer',
}
// The pair, together. `...SURFACE.note` carries the foreground with it.
const noteBox = {
  ...SURFACE.note, border: '1px solid #f0e2da', borderRadius: 8,
  padding: 16, margin: '0 0 20px',
}

export default async function SegmentationScreen({
  params, searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ erro?: string; guardado?: string; grupo?: string; origem?: string }>
}) {
  await requireOperator()
  const { clientId } = await params
  const { erro, guardado, grupo, origem } = await searchParams
  const screen = await readScreen(clientId)
  const groups = proposeGroups(screen.contacts)
  const byId = new Map(screen.contacts.map((c) => [c.id, c]))

  // Derived from the policy table, never hardcoded: when the table changes the
  // sentence changes, and the screen never asserts what the table does not hold.
  const jurisdiction = jurisdictionSentence(screen.jurisdictions)

  const chosenSegment =
    origem === 'A' || origem === 'B' || origem === 'C' || origem === 'D' ? origem : null
  const openGroup = grupo ? groups.find((g) => g.id === grupo) ?? null : null

  return (
    <main style={{
      ...SURFACE.page, minHeight: '100vh',
      maxWidth: 820, margin: '0 auto', padding: '40px 24px', fontSize: 16, lineHeight: 1.6,
    }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{UI.title}</h1>
      <p style={{ ...muted, marginTop: 0 }}>{UI.intro}</p>

      {erro && (
        <p role="alert" style={{ ...SURFACE.error, border: '1px solid #e8c4bc', borderRadius: 8, padding: 14 }}>
          {erro}
        </p>
      )}
      {guardado && (
        <p role="status" style={{ ...SURFACE.ok, border: '1px solid #cbe2cb', borderRadius: 8, padding: 14 }}>
          {UI.saved(Number(guardado))}
        </p>
      )}

      <h2 style={{ fontSize: 20, marginTop: 36 }}>{UI.groupHeading}</h2>

      {groups.map((g) => {
        const contacts = g.contactIds.map((id) => byId.get(id)!).filter(Boolean)
        const isOpen = openGroup?.id === g.id

        // One group at a time once a question is being answered: the others
        // collapse to a line, so the screen in front of the room holds one
        // question rather than four stacked forms.
        if (openGroup && !isOpen) {
          return (
            <p key={g.id} style={{ ...muted, fontSize: 14, margin: '0 0 10px' }}>{g.label}</p>
          )
        }

        return (
          <section key={g.id} style={card}>
            <h3 style={{ fontSize: 17, margin: '0 0 4px' }}>{g.label}</h3>
            <p style={{ ...muted, margin: '0 0 16px', fontSize: 14 }}>
              {g.proposal ? `${UI.proposalPrefix} ${g.proposal.why}. ${UI.proposalHint}` : UI.noProposal}
            </p>

            {isOpen && chosenSegment
              ? (
                <Step2
                  clientId={clientId} group={g} contacts={contacts}
                  segment={chosenSegment} jurisdiction={jurisdiction}
                />
              )
              : <Step1 clientId={clientId} groupId={g.id} jurisdiction={jurisdiction} />}
          </section>
        )
      })}

      {openGroup && (
        <p style={{ marginTop: 8, fontSize: 14 }}>
          <a href={`/segmentation/${clientId}`}>{UI.backToAll}</a>
        </p>
      )}

      {screen.history.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 20 }}>{UI.historyHeading}</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {screen.history.map((h, i) => (
              <li key={i} style={{ padding: '10px 0', borderTop: '1px solid #eee', fontSize: 15 }}>
                {h.phone} · {h.segment ? SEGMENT_CHOICE[h.segment as 'A'].label : '—'}
                <br />
                <span style={{ ...muted, fontSize: 14 }}>
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

      {screen.contacts.length === 0 && <p style={muted}>{UI.noContacts}</p>}

      {/* Only when somebody actually has. A note explaining what "pediu para não
          ser contactado" means, standing alone at the foot of a screen where
          nobody did, describes a person who is not in the room. Same rule as a
          clean week not mentioning unattributed conversations. */}
      {screen.contacts.some((c) => c.state === 'objected') && (
        <p style={{ ...muted, fontSize: 13, marginTop: 48 }}>
          {STATE_LABEL.objected}: {STATE_NOTE.objected}
        </p>
      )}
    </main>
  )
}

/** Step 1: one question, four answers, nothing else on the card. */
function Step1({ clientId, groupId, jurisdiction }: {
  clientId: string; groupId: string; jurisdiction: string
}) {
  return (
    <form method="get" action={`/segmentation/${clientId}`}>
      <input type="hidden" name="grupo" value={groupId} />
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
        <legend style={{ fontWeight: 600, marginBottom: 12, padding: 0 }}>{UI.segmentLegend}</legend>
        {(['A', 'B', 'C', 'D'] as const).map((seg) => (
          // Each answer is its own bordered block. Before this they were four
          // labels and four consequence lines separated only by a <br>, which
          // read aloud as one continuous paragraph — the listener could not hear
          // where an option ended, and each consequence sat nearer the NEXT
          // option's label than its own.
          <label key={seg} style={optionCard}>
            <span style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* No pre-selection: a pre-ticked option collects a click rather
                  than a decision, and the click carries the weight of a
                  declaration (§11d). */}
              {/* 44px, or it fails probe:layout on a phone and is a poor
                  target on a laptop in a meeting. Found once the probe was
                  given a clientId: this route had been SKIPPED for want of
                  one, so the tap-target check had never run on it at all. */}
              <input type="radio" name="origem" value={seg} required
                style={{ marginTop: 6, minWidth: 44, minHeight: 44 }} />
              <span>
                <span style={{ fontWeight: 600 }}>{SEGMENT_CHOICE[seg].label}</span>
                <span style={{ display: 'block', ...muted, fontSize: 14, marginTop: 4 }}>
                  {seg === 'A' ? jurisdiction : SEGMENT_CHOICE[seg].consequence}
                </span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <button type="submit" style={{ padding: '10px 18px', fontSize: 16 }}>
        {UI.continueToDetail}
      </button>
    </form>
  )
}

/** Step 2: what that answer still needs — and nothing it does not. */
function Step2({ clientId, group, contacts, segment, jurisdiction }: {
  clientId: string
  group: Group
  contacts: ContactRow[]
  segment: 'A' | 'B' | 'C' | 'D'
  jurisdiction: string
}) {
  // Composed in present.ts, which the probe also reads — see the box there.
  const view = presentStep2({ contacts, segment, jurisdiction })

  return (
    <form action={declareGroupAction}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="groupId" value={group.id} />
      <input type="hidden" name="groupLabel" value={group.label} />
      <input type="hidden" name="segment" value={segment} />
      {contacts.map((c) => <input key={c.id} type="hidden" name="contact" value={c.id} />)}

      <p style={{ margin: '0 0 6px' }}>{view.youSaid}</p>
      <p style={{ ...muted, fontSize: 14, margin: '0 0 4px' }}>{view.consequence}</p>
      {/* The escape hatch. If they realise they answered wrong, this is the
          control they need, so it is not allowed to be the faintest element on
          the screen — it renders at body size in the surface's own text colour,
          never muted. */}
      <p style={{ fontSize: 16, margin: '0 0 20px' }}>
        <a
          href={`/segmentation/${clientId}?grupo=${encodeURIComponent(group.id)}`}
          style={{ color: SURFACE.page.color, fontWeight: 600 }}
        >
          {UI.changeAnswer}
        </a>
      </p>

      {/* The file note comes AFTER the origin, and only when this group's file
          actually claimed something. It is an admission, so it belongs to the
          question it explains rather than to the opening of a meeting. */}
      {view.note && (
        <div style={noteBox}>
          <strong>{view.note.heading}</strong>
          <p style={{ margin: '8px 0' }}>{view.note.body}</p>
          <p style={{ margin: '8px 0 0' }}>{view.note.scope}</p>
          {view.note.extra && (
            <p style={{ ...mutedOnNote, fontSize: 14, margin: '8px 0 0' }}>{view.note.extra}</p>
          )}
          <p style={{ ...mutedOnNote, fontSize: 14, margin: '10px 0 0' }}>{view.note.count}</p>
        </div>
      )}

      {/* B is the only answer that claims evidence exists, and it is the only
          one asked for it. declare.ts has always refused a B with no basis, so
          asking every segment for it was the screen disagreeing with the record
          it writes — and asking it BEFORE the origin was worse than that. */}
      {view.ask.kind === 'basis' ? (
        <label style={{ display: 'block', marginBottom: 20 }}>
          <strong>{view.ask.question}</strong>
          <span style={{ display: 'block', ...muted, fontSize: 14 }}>{view.ask.hint}</span>
          <input name="basis" required style={field} />
        </label>
      ) : (
        <p style={{ ...muted, fontSize: 14, margin: '0 0 20px' }}>{view.ask.text}</p>
      )}

      {/* Directly under the answer it qualifies. Below the name field it read as
          uncertainty about the NAME — which is a different claim, and not one
          anybody was making. */}
      <label style={{ display: 'block', margin: '0 0 24px', fontSize: 15 }}>
        <input type="checkbox" name="uncertainty" style={{ minWidth: 44, minHeight: 44 }} />{' '}
        {UI.unsure}
      </label>

      <label style={{ display: 'block', marginBottom: 20 }}>
        <strong>{UI.whoIsDeclaring}</strong>
        <span style={{ display: 'block', ...muted, fontSize: 14 }}>{UI.whoIsDeclaringHint}</span>
        <input name="declaredBy" required style={field} />
      </label>

      <details style={{ marginBottom: 24 }}>
        <summary style={{ cursor: 'pointer' }}>{UI.exceptions}</summary>
        <ul style={{ listStyle: 'none', padding: '10px 0 0', margin: 0 }}>
          {contacts.map((c) => {
            const d = describeContact(c)
            return (
              <li key={c.id} style={{ padding: '6px 0', fontSize: 15 }}>
                <label>
                  <input type="checkbox" name="exclude" value={c.id} />{' '}
                  {d.name} · {d.phone}
                  <span style={{ ...muted, marginLeft: 8, fontSize: 13 }}>{d.state}</span>
                  {c.claimRaw && (
                    <span style={{ ...muted, marginLeft: 8, fontSize: 13 }}>
                      {UI.fromFile(c.claimRaw)}
                    </span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      </details>

      <button type="submit" style={{ padding: '10px 18px', fontSize: 16 }}>
        {UI.confirm}
      </button>
    </form>
  )
}
