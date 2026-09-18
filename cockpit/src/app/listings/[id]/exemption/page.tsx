import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { declareExemptionAction } from '@/lib/publication/exemption-actions'
import { EXEMPTION } from '@/lib/matching/screen-copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const field: React.CSSProperties = {
  display: 'block', width: '100%', minHeight: 44, fontSize: 16,
  padding: '8px 10px', border: '1px solid #ccc', borderRadius: 2,
  background: '#fff', color: '#111',
}
const muted: React.CSSProperties = { color: '#555' }

/**
 * Written to read like the segmentation declaration, on purpose.
 *
 * Same two fields in the same order, the same hint under "who is saying this",
 * and the same admission that we are recording rather than deciding. An agency
 * that has sat through the contact declaration recognises this one, and that
 * recognition is worth more than any wording we could improve.
 */
export default async function Exemption({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator()
  const { id } = await params

  const { data: listing } = await admin()
    .from('listings')
    .select('id, reference, area, energy_class, energy_exemption')
    .eq('id', id)
    .maybeSingle()
  if (!listing) notFound()

  const rated = Boolean((listing.energy_class as string | null)?.trim())
  const current = listing.energy_exemption as
    { declared_by?: string; basis?: string; at?: string } | null

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{EXEMPTION.title}</h1>
      <p style={{ ...muted, marginTop: 0 }}>
        {[listing.reference, listing.area].filter(Boolean).join(' · ')}
      </p>
      <p>{EXEMPTION.intro}</p>
      <p style={{ ...muted, fontSize: 15 }}>{EXEMPTION.whatItDoesNot}</p>

      {rated && <p style={{ marginTop: 24 }}>{EXEMPTION.already}</p>}

      {!rated && current?.declared_by && (
        <section style={{ marginTop: 24, padding: 16, background: '#f5f7f5', borderLeft: '3px solid #4a6a4a' }}>
          <p style={{ margin: 0 }}>
            {EXEMPTION.current(current.declared_by, String(current.at ?? '').slice(0, 10))}
          </p>
          <p style={{ margin: '8px 0 0' }}>
            <strong>{EXEMPTION.currentBasis}</strong> {current.basis}
          </p>
        </section>
      )}

      {!rated && !current?.declared_by && (
        <p style={{ ...muted, marginTop: 24 }}>{EXEMPTION.nothingYet}</p>
      )}

      {!rated && (
        <form action={declareExemptionAction} style={{ marginTop: 32 }}>
          <input type="hidden" name="listingId" value={id} />

          <label style={{ display: 'block', marginBottom: 20 }}>
            <strong>{EXEMPTION.basis}</strong>
            <span style={{ display: 'block', ...muted, fontSize: 14 }}>{EXEMPTION.basisHint}</span>
            <input name="basis" required style={field} />
          </label>

          <label style={{ display: 'block', marginBottom: 20 }}>
            <strong>{EXEMPTION.whoIsDeclaring}</strong>
            <span style={{ display: 'block', ...muted, fontSize: 14 }}>{EXEMPTION.whoIsDeclaringHint}</span>
            <input name="declaredBy" required style={field} />
          </label>

          <button type="submit" style={{
            minHeight: 44, fontSize: 16, padding: '10px 20px',
            background: '#111', color: '#fff', border: 0, borderRadius: 2, cursor: 'pointer',
          }}>
            {EXEMPTION.save}
          </button>
        </form>
      )}
    </main>
  )
}
