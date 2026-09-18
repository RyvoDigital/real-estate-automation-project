import { requireOperator } from '@/lib/auth'
import { getClients } from '@/lib/data'
import { readCalibration } from '@/lib/matching/screen-read'
import { saveCalibrationAction } from '@/lib/matching/calibrate-actions'
import { CALIBRATE } from '@/lib/matching/screen-copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const euro = (n: number) => `€${n.toLocaleString('pt-PT')}`

const field: React.CSSProperties = {
  display: 'block', width: '100%', minHeight: 44, fontSize: 16,
  padding: '8px 10px', border: '1px solid #ccc', borderRadius: 2,
  // §probe:contrast — the browser paints inputs for dark mode otherwise, and
  // the controls become unreadable on a laptop turned around.
  background: '#fff', color: '#111',
}
const label: React.CSSProperties = { display: 'block', marginTop: 20, fontSize: 16 }

/**
 * The calibration conversation, as a screen.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ NOTHING IS PRE-FILLED WHEN NOTHING HAS BEEN ANSWERED.                   │
 * │                                                                         │
 * │ Not a default, not a placeholder holding a plausible number. §4.6 says  │
 * │ any value chosen now is a guess, and a pre-filled field collects a      │
 * │ click rather than a decision — which would then be recorded as an       │
 * │ agency's judgement about their own market. The same rule as the         │
 * │ segmentation screen's proposals never being pre-selected.               │
 * │                                                                         │
 * │ Once they HAVE answered, the fields carry their own answers back, so    │
 * │ changing one thing does not mean retyping six.                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export default async function Calibrate({ params }: { params: Promise<{ clientId: string }> }) {
  await requireOperator()
  const { clientId } = await params
  const clients = await getClients()
  const name = clients.find((c) => c.id === clientId)?.name ?? ''
  const state = await readCalibration(clientId)
  const prior = state.saved
    ? (state.thresholds as unknown as { calibration?: { answers?: Record<string, unknown> } }).calibration?.answers
    : undefined
  const a = (k: string) => (prior?.[k] === null || prior?.[k] === undefined ? '' : String(prior[k]))

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{CALIBRATE.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{name}</p>
      <p>{CALIBRATE.intro}</p>
      <p style={{ color: '#555', fontSize: 14 }}>{CALIBRATE.why}</p>

      {!state.saved && <p style={{ color: '#555' }}>{CALIBRATE.notSavedYet}</p>}
      {state.saved && (
        <section style={{ marginTop: 24, padding: 16, background: '#f5f7f5', borderLeft: '3px solid #4a6a4a' }}>
          <p style={{ margin: 0 }}>
            {CALIBRATE.savedSummary(
              euro(2_000_000),
              euro(state.explained.plainCeiling),
              euro(state.explained.statedCeiling),
            )}
          </p>
          <p style={{ marginBottom: 0 }}>
            {state.explained.bedrooms ? CALIBRATE.savedBedroomsYes : CALIBRATE.savedBedroomsNo}
          </p>
          {state.explained.areas.length === 0 && (
            <p style={{ marginBottom: 0 }}>{CALIBRATE.savedAreasNone}</p>
          )}
        </section>
      )}

      <form action={saveCalibrationAction}>
        <input type="hidden" name="clientId" value={clientId} />

        <h2 style={{ fontSize: 20, marginTop: 40 }}>{CALIBRATE.budgetHeading}</h2>
        <label style={label}>
          {CALIBRATE.budgetSaid}
          <input name="budgetSaid" defaultValue={a('budgetSaid')} inputMode="numeric" style={field} />
        </label>
        <label style={label}>
          {CALIBRATE.budgetMost}
          <input name="budgetMost" defaultValue={a('budgetMost')} inputMode="numeric" style={field} />
        </label>
        <label style={label}>
          {CALIBRATE.budgetStretchMost}
          <input name="budgetStretchMost" defaultValue={a('budgetStretchMost')} inputMode="numeric" style={field} />
        </label>

        <h2 style={{ fontSize: 20, marginTop: 40 }}>{CALIBRATE.bedroomsHeading}</h2>
        {/* A select, not a pair of radios: a radio that satisfies the 44px tap
            target has to be drawn 44px across, which looks wrong, and one that
            looks right measures 24px and fails. The empty first option is the
            honest unanswered state — it is not a default answer. */}
        <label style={label}>
          {CALIBRATE.bedroomsQuestion}
          <select
            name="showsOneFewerBedroom"
            defaultValue={prior?.showsOneFewerBedroom === true ? 'yes' : prior?.showsOneFewerBedroom === false ? 'no' : ''}
            style={field}
          >
            <option value="">{CALIBRATE.chooseOne}</option>
            <option value="yes">{CALIBRATE.yes}</option>
            <option value="no">{CALIBRATE.no}</option>
          </select>
        </label>

        <h2 style={{ fontSize: 20, marginTop: 40 }}>{CALIBRATE.scoreHeading}</h2>
        <label style={label}>
          {CALIBRATE.ofHowMany}
          <input name="ofHowMany" defaultValue={a('ofHowMany')} inputMode="numeric" style={field} />
        </label>
        <label style={label}>
          {CALIBRATE.strongAtLeast}
          <input name="strongAtLeast" defaultValue={a('strongAtLeast')} inputMode="numeric" style={field} />
        </label>
        <label style={label}>
          {CALIBRATE.possibleAtLeast}
          <input name="possibleAtLeast" defaultValue={a('possibleAtLeast')} inputMode="numeric" style={field} />
        </label>

        <h2 style={{ fontSize: 20, marginTop: 40 }}>{CALIBRATE.areasHeading}</h2>
        <p style={{ marginBottom: 0 }}>{CALIBRATE.areasQuestion}</p>
        <p style={{ color: '#555', fontSize: 14, marginTop: 4 }}>{CALIBRATE.areasNote}</p>
        <p style={{ color: '#555', fontSize: 14, marginTop: 0 }}>{CALIBRATE.areasEmpty}</p>
        <textarea name="adjacency" defaultValue={a('adjacency')} rows={5}
          style={{ ...field, minHeight: 120, fontFamily: 'inherit' }} />

        <button type="submit" style={{
          marginTop: 32, minHeight: 44, fontSize: 16, padding: '10px 20px',
          background: '#111', color: '#fff', border: 0, borderRadius: 2, cursor: 'pointer',
        }}>
          {CALIBRATE.save}
        </button>
      </form>
    </main>
  )
}
