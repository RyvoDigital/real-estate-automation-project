import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { admin } from '@/lib/supabase/admin'
import { alreadyRated, listingFacts } from '@/lib/publication/facts-store'
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
    .select('id, reference, area, region, client_id')
    .eq('id', id)
    .maybeSingle()
  if (!listing) notFound()

  /*
   * WHICH requirement is being exempted comes from the jurisdiction, not from
   * this file. Portugal's rating is `pt_energy_class`; Spain's is a different
   * id with a different shape, and whether either is exemptible at all is the
   * policy row's answer.
   *
   * ⚠️ Until the gate is requirement-driven the screen resolves the single
   * Portuguese rating requirement, and it does so by READING THE POLICY ROW
   * rather than by knowing the id — so the day a second exemptible requirement
   * exists, this asks for a choice instead of silently exempting the first.
   */
  const { data: policy } = await admin()
    .from('advertising_policy')
    .select('requires')
    .eq('country', 'PT')
    .is('region', null)
    .maybeSingle()
  const exemptible = (((policy?.requires ?? []) as { id: string; exemptible?: boolean }[]))
    .filter((r) => r.exemptible)
  const requirementId = exemptible.length === 1 ? exemptible[0].id : null

  const facts = await listingFacts(id)
  const fact = requirementId ? facts.find((f) => f.requirementId === requirementId) : undefined
  const rated = requirementId ? alreadyRated(facts, requirementId) : false
  const current = fact?.exemption ?? null

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

      {/* No exemptible requirement resolved — no form. A screen that offered
          an exemption against nothing would write a declaration nobody could
          act on. */}
      {!rated && requirementId && (
        <form action={declareExemptionAction} style={{ marginTop: 32 }}>
          <input type="hidden" name="listingId" value={id} />
          <input type="hidden" name="requirementId" value={requirementId} />

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
