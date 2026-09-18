import { requireOperator } from '@/lib/auth'
import { readScreen } from '@/lib/segmentation/read'
import { proposeGroups, describeContact, sharedClaimCell } from '@/lib/segmentation/groups'
import { declareGroupAction } from '@/lib/segmentation/actions'
import {
  UI, SEGMENT_CHOICE, STATE_LABEL, STATE_NOTE, CLAIM_QUESTION, jurisdictionSentence,
} from '@/lib/segmentation/copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const muted = { color: '#666' }
const card = { border: '1px solid #e4e4e4', borderRadius: 10, padding: 20, marginBottom: 18 }

export default async function SegmentationScreen({
  params, searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ erro?: string; guardado?: string }>
}) {
  await requireOperator()
  const { clientId } = await params
  const { erro, guardado } = await searchParams
  const screen = await readScreen(clientId)
  const groups = proposeGroups(screen.contacts)
  const byId = new Map(screen.contacts.map((c) => [c.id, c]))

  // Derived from the policy table, never hardcoded: when the table changes the
  // sentence changes, and the screen never asserts what the table does not hold.
  const jurisdiction = jurisdictionSentence(screen.jurisdictions)

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{UI.title}</h1>
      <p style={{ ...muted, marginTop: 0 }}>{UI.intro}</p>

      {erro && (
        <p role="alert" style={{ background: '#fdf0ee', border: '1px solid #e8c4bc', borderRadius: 8, padding: 14 }}>
          {erro}
        </p>
      )}
      {guardado && (
        <p role="status" style={{ background: '#f1f7f1', border: '1px solid #cbe2cb', borderRadius: 8, padding: 14 }}>
          {UI.saved(Number(guardado))}
        </p>
      )}

      <h2 style={{ fontSize: 20, marginTop: 36 }}>{UI.groupHeading}</h2>

      {groups.map((g) => {
        const contacts = g.contactIds.map((id) => byId.get(id)!).filter(Boolean)
        // `hasClaim`, not `claimRaw !== null`: a claim whose wording was not
        // retained is still a claim, and filtering on the text would have made
        // the hard question disappear for exactly the contacts it is about.
        const withClaim = contacts.filter((c) => c.hasClaim)
        const cell = sharedClaimCell(withClaim)
        const claimHeading = cell
          ? `${CLAIM_QUESTION.headingWithCell.before}«${cell}»${CLAIM_QUESTION.headingWithCell.after}`
          : CLAIM_QUESTION.headingCellNotKept
        const claimQuestion = cell
          ? `${CLAIM_QUESTION.questionWithCell.before}«${cell}»${CLAIM_QUESTION.questionWithCell.after}`
          : CLAIM_QUESTION.questionCellNotKept

        return (
          <section key={g.id} style={card}>
            <h3 style={{ fontSize: 17, margin: '0 0 4px' }}>{g.label}</h3>
            <p style={{ ...muted, margin: '0 0 16px', fontSize: 14 }}>
              {g.proposal ? `${UI.proposalPrefix} ${g.proposal.why}. ${UI.proposalHint}` : UI.noProposal}
            </p>

            {withClaim.length > 0 && (
              <div style={{ background: '#fbf6f3', border: '1px solid #f0e2da', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <strong>{claimHeading}</strong>
                <p style={{ margin: '8px 0' }}>
                  {CLAIM_QUESTION.body}{cell ? '' : ` ${CLAIM_QUESTION.bodyCellNotKept}`}
                </p>
                <p style={{ margin: '8px 0 4px' }}><strong>{claimQuestion}</strong></p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {Object.entries(CLAIM_QUESTION.options).map(([key, o]) => (
                    <li key={key} style={{ marginBottom: 6 }}>
                      {o.label}<br />
                      <span style={{ ...muted, fontSize: 14 }}>{o.note}</span>
                    </li>
                  ))}
                </ul>
                <p style={{ ...muted, fontSize: 14, marginBottom: 0 }}>
                  {UI.claimCount(withClaim.length, contacts.length)}
                </p>
              </div>
            )}

            <form action={declareGroupAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="groupId" value={g.id} />
              <input type="hidden" name="groupLabel" value={g.label} />
              {contacts.map((c) => <input key={c.id} type="hidden" name="contact" value={c.id} />)}

              <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
                <legend style={{ fontWeight: 600, marginBottom: 8 }}>{UI.segmentLegend}</legend>
                {(['A', 'B', 'C', 'D'] as const).map((seg) => (
                  <label key={seg} style={{ display: 'block', marginBottom: 10 }}>
                    {/* No pre-selection: a pre-ticked option collects a click
                        rather than a decision, and the click carries the weight
                        of a declaration (§11d). */}
                    <input type="radio" name="segment" value={seg} required />{' '}
                    {SEGMENT_CHOICE[seg].label}
                    <br />
                    <span style={{ ...muted, fontSize: 14, marginLeft: 22 }}>
                      {seg === 'A' ? jurisdiction : SEGMENT_CHOICE[seg].consequence}
                    </span>
                  </label>
                ))}
              </fieldset>

              <label style={{ display: 'block', marginBottom: 6 }}>
                <strong>{UI.whoIsDeclaring}</strong><br />
                <span style={{ ...muted, fontSize: 14 }}>{UI.whoIsDeclaringHint}</span><br />
                <input name="declaredBy" required style={{ width: '100%', padding: 8, marginTop: 6 }} />
              </label>

              <label style={{ display: 'block', marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>{CLAIM_QUESTION.options.have_record.detailPrompt}</span>
                <input name="basis" style={{ width: '100%', padding: 8, marginTop: 6 }} />
              </label>

              <label style={{ display: 'block', margin: '10px 0 16px', fontSize: 14 }}>
                <input type="checkbox" name="uncertainty" />{' '}
                {CLAIM_QUESTION.options.dont_know.label}
              </label>

              <details style={{ marginBottom: 16 }}>
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
                {UI.declareGroup}
              </button>
            </form>
          </section>
        )
      })}

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

      {screen.contacts.length === 0 && (
        <p style={muted}>{UI.noContacts}</p>
      )}

      <p style={{ ...muted, fontSize: 13, marginTop: 48 }}>
        {STATE_LABEL.objected}: {STATE_NOTE.objected}
      </p>
    </main>
  )
}
