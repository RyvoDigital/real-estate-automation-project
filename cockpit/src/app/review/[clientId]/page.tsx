import { requireOperator } from '@/lib/auth'
import { readReviewScreen } from '@/lib/review/screen-read'
import { explainTheGap } from '@/lib/review/reconcile-asks'
import { REVIEW } from '@/lib/matching/screen-copy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Automation 05's one screen.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ IT SURFACES AND DOES NOT ACT, AND HERE THAT IS A COMPLIANCE PROPERTY    │
 * │ RATHER THAN A PREFERENCE.                                               │
 * │                                                                         │
 * │ There is no control on this page. In particular there is no way to      │
 * │ exclude one sale: §8.B — pedir a todos é permitido, escolher a quem     │
 * │ pedir não é — and a skip button would be the offence with an audit      │
 * │ trail showing who committed it.                                         │
 * │                                                                         │
 * │ This is the one place in the system where the tempting act is the KIND  │
 * │ one. Sparing the client who had a difficult sale is what a decent       │
 * │ person would do by hand. The control does not exist so that nobody has  │
 * │ to be decent about it at 6pm on a Friday.                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The three counts are side by side DELIBERATELY. Somebody will notice the ask
 * list is shorter than the sales list, and a discrepancy that is displayed and
 * explained does not get investigated as a defect.
 */
export default async function Review({ params }: { params: Promise<{ clientId: string }> }) {
  await requireOperator()
  const { clientId } = await params
  const s = await readReviewScreen(clientId)

  const page = { maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontSize: 16, lineHeight: 1.6 }
  const muted = { color: '#555', fontSize: 14 }

  if (!s.report.checked) {
    return (
      <main style={page}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>{REVIEW.title}</h1>
        <p style={{ color: '#555', marginTop: 0 }}>{s.clientName}</p>
        <p style={{ marginTop: 32 }}>{REVIEW.notChecked}</p>
      </main>
    )
  }

  const r = s.report
  const gap = explainTheGap(r)

  return (
    <main style={page}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{REVIEW.title}</h1>
      <p style={{ color: '#555', marginTop: 0 }}>{s.clientName}</p>

      {!s.enabled && <p style={{ marginTop: 24 }}>{REVIEW.switchedOff}</p>}
      {s.reviewLink === null && <p style={{ marginTop: 24 }}>{REVIEW.noLink}</p>}

      {r.closes === 0 ? (
        <p style={{ marginTop: 32 }}>{REVIEW.nothingYet}</p>
      ) : (
        <>
          {/* The three counts, together, so the difference is seen here rather
              than discovered later by somebody counting rows in two places. */}
          <div style={{ display: 'flex', gap: 32, marginTop: 32, flexWrap: 'wrap' }}>
            <Count label={REVIEW.closesLabel} n={r.closes} />
            <Count label={REVIEW.askedLabel} n={r.asked} />
            <Count label={REVIEW.pendingLabel} n={r.pending} />
          </div>

          {gap.difference > 0 && (
            <section style={{ marginTop: 32 }}>
              <h2 style={{ fontSize: 18 }}>{REVIEW.gapHeading}</h2>
              <p style={{ marginTop: 0 }}>{REVIEW.gapWhy}</p>
              <ul style={{ paddingLeft: 20 }}>
                {gap.lines.map((l) => (
                  <li key={l.reason} style={{ marginBottom: 8 }}>{REVIEW.gapLine(l.count, l.means)}</li>
                ))}
              </ul>
              {/* Said after the list as well as before it, because the list is
                  what somebody scrolls to and the rule is what they must leave
                  with. */}
              <p style={{ fontWeight: 600 }}>{REVIEW.gapDoNotClose}</p>
            </section>
          )}

          <section style={{ marginTop: 32 }}>
            {r.unaccounted.length === 0 ? (
              <p>{REVIEW.findingNone}</p>
            ) : (
              <>
                <p style={{ fontSize: 22, lineHeight: 1.4, marginBottom: 8 }}>
                  {r.unaccounted.length === 1 ? REVIEW.findingOne : REVIEW.findingMany(r.unaccounted.length)}
                </p>
                <p style={{ marginTop: 0 }}>{REVIEW.findingWhy}</p>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {r.unaccounted.map((u) => (
                    <li key={u.closeId} style={{ padding: '10px 0', borderTop: '1px solid #eee' }}>
                      {REVIEW.findingRow(u.listingReference ?? REVIEW.findingNoReference, u.closedOn)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {/* ⚠️ ON THE SCREEN, NOT IN A FOOTNOTE. An empty finding list reads as
          "nobody was missed"; what it means is "nobody we were told about was
          missed", and those are different claims. */}
      <section style={{ marginTop: 40, borderTop: '1px solid #eee', paddingTop: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>{REVIEW.limitsHeading}</h2>
        <ul style={{ ...muted, paddingLeft: 20, margin: 0 }}>
          {REVIEW.limits.map((l) => <li key={l} style={{ marginBottom: 6 }}>{l}</li>)}
        </ul>
      </section>
    </main>
  )
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <div style={{ fontSize: 32, lineHeight: 1.1 }}>{n}</div>
      <div style={{ color: '#555', fontSize: 14 }}>{label}</div>
    </div>
  )
}
