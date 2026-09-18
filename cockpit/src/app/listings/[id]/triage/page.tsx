import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { readTriage } from '@/lib/matching/triage-read'
import { pickForListingAction } from '@/lib/matching/triage-actions'
import { LISTINGS, TRIAGE } from '@/lib/matching/screen-copy'
import type { TriageGroup } from '@/lib/matching/triage'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const field: React.CSSProperties = {
  display: 'block', width: '100%', minHeight: 44, fontSize: 16,
  padding: '8px 10px', border: '1px solid #ccc', borderRadius: 2,
  background: '#fff', color: '#111',
}

/**
 * The triage floor — the product for an agency with no structured data.
 *
 * It needs no thresholds and no calibration: every other part of 03 refuses
 * until that conversation has happened, and this works today on real rows. That
 * is what makes it the floor rather than a fallback.
 *
 * The agent's own judgement is recorded as theirs — `chosen_by` is the person
 * at the agency, never the operator driving the screen, for the same reason the
 * declaration screen keeps the two apart.
 */
function label(g: TriageGroup): string {
  switch (g.kind) {
    case 'batch': return TRIAGE.groupBatch(g.label)
    case 'year': return TRIAGE.groupYear(g.label)
    case 'area': return TRIAGE.groupArea(g.label)
    case 'rest': return TRIAGE.groupRest
  }
}

export default async function Triage({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator()
  const { id } = await params
  const screen = await readTriage(id)
  if (!screen.listing) notFound()

  const l = screen.listing
  const head = [l.reference, l.area, l.price === null ? null : `€${l.price.toLocaleString('pt-PT')}`]
    .filter(Boolean)
    .join(' · ')
  const left = screen.total - screen.chosen

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{TRIAGE.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{head}</p>
      <p>{TRIAGE.intro}</p>
      <p style={{ color: '#555' }}>{TRIAGE.what}</p>

      {l.status !== 'available' && (
        <p style={{ padding: 16, background: '#faf6f6', borderLeft: '3px solid #8a1f1f' }}>
          {TRIAGE.notAvailable}
        </p>
      )}

      {screen.chosen > 0 && (
        <p style={{ color: '#555' }}>
          {screen.chosen === 1 ? TRIAGE.chosenSoFarOne : TRIAGE.chosenSoFarMany(screen.chosen)}
        </p>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href={`/listings/${id}`} style={{ minHeight: 44, display: 'inline-block', lineHeight: '44px' }}>
          {LISTINGS.title}
        </Link>
      </p>

      {screen.total === 0 && <p style={{ marginTop: 32 }}>{TRIAGE.emptyList}</p>}
      {screen.total > 0 && left === 0 && <p style={{ marginTop: 32 }}>{TRIAGE.noneLeft}</p>}

      {screen.groups.map((g) => (
        <section key={g.id} style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 20, marginBottom: 4 }}>{label(g)}</h2>
          {/* The n=1 rule: a count of one never reads as "1 contactos". */}
          <p style={{ color: '#555', fontSize: 14, marginTop: 0 }}>
            {g.contacts.length === 1 ? TRIAGE.countOne : TRIAGE.countMany(g.contacts.length)}
          </p>

          {g.contacts.map((c) => (
            <details key={c.leadId} style={{ padding: '12px 0', borderTop: '1px solid #eee' }}>
              <summary style={{ minHeight: 44, lineHeight: '44px', fontSize: 18, cursor: 'pointer' }}>
                {c.name ?? TRIAGE.nameless}
                {c.alreadyChosen ? ` · ${TRIAGE.chosenAlready}` : ''}
              </summary>

              {!c.alreadyChosen && (
                <form action={pickForListingAction} style={{ marginTop: 8 }}>
                  <input type="hidden" name="listingId" value={id} />
                  <input type="hidden" name="leadId" value={c.leadId} />

                  <label style={{ display: 'block', marginTop: 12 }}>
                    {TRIAGE.whoDecides}
                    <input name="declaredBy" required style={field} />
                  </label>
                  <p style={{ color: '#555', fontSize: 14, marginTop: 4 }}>{TRIAGE.whoDecidesNote}</p>

                  <label style={{ display: 'block', marginTop: 12 }}>
                    {TRIAGE.why}
                    <input name="reason" style={field} />
                  </label>
                  <p style={{ color: '#555', fontSize: 14, marginTop: 4 }}>{TRIAGE.whyNote}</p>
                  {/* Says exactly what a sentence does and does not buy. The
                      tier ladder's own rule: never claim more than the data
                      supports, including about this screen. */}
                  <p style={{ color: '#555', fontSize: 14, marginTop: 0 }}>{TRIAGE.whyHelps}</p>

                  <button type="submit" style={{
                    marginTop: 16, minHeight: 44, fontSize: 16, padding: '10px 20px',
                    background: '#111', color: '#fff', border: 0, borderRadius: 2, cursor: 'pointer',
                  }}>
                    {TRIAGE.pick}
                  </button>
                </form>
              )}
            </details>
          ))}
        </section>
      ))}
    </main>
  )
}
