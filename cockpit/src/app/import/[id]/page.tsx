import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getOpenCount } from '@/lib/data'
import { getBatch, previewBatch } from '@/lib/import/store'
import { Shell } from '@/components/Shell'
import { CommitBar, MappingReview, RevertButton } from '@/components/Import'
import { IconBack, IconWarning } from '@/components/Icons'
import { TIER_LABEL, TIER_MEANS, type Tier } from '@/lib/import/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const money = (n: number | null) =>
  n === null ? '—' : n >= 1_000_000 ? `€${(Math.round((n / 1e6) * 10) / 10).toString().replace(/\.0$/, '')}M` : `€${Math.round(n / 1000)}k`

export default async function ImportBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const operator = await requireOperator()
  const { id } = await params
  const [batch, openCount] = await Promise.all([getBatch(id), getOpenCount()])
  if (!batch) notFound()

  const preview = batch.mapping && batch.staged ? await previewBatch(batch, batch.mapping) : null
  const report = preview?.report ?? (batch.report as typeof preview extends null ? never : never) ?? null
  const committed = batch.status === 'committed'
  const reverted = batch.status === 'reverted'
  const stored = batch.report as { accepted?: number; rejected?: { row: number; reason: string }[]; duplicatesInFile?: { row: number; on: string; matches: number | string; value: string }[]; duplicatesAgainstExisting?: { row: number; on: string; value: string }[]; received?: number; tier?: Tier; revert?: { removable: string[]; retained: { id: string; name: string | null; reason: string }[] } }
  const shown = preview?.report ?? stored

  return (
    <Shell active="import" openCount={openCount} email={operator.email}>
      <Link href="/import" className="backlink">
        <IconBack size={15} />
        Imports
      </Link>

      <header className="head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">{batch.format.toUpperCase()} · {batch.source_headers.length} columns</span>
          <h1 className="head__title wrap-any">{batch.filename}</h1>
        </div>
      </header>

      {!committed && !reverted && (
        <MappingReview
          batchId={batch.id}
          columns={batch.proposal.columns}
          note={batch.proposal.note}
          by={batch.proposal.by}
          approved={Boolean(batch.mapping)}
        />
      )}

      {shown && typeof shown.received === 'number' && (
        <>
          <div className="section">
            <span className="eyebrow">{committed ? 'What landed' : reverted ? 'What was imported' : 'What would land'}</span>
            <hr />
          </div>

          <div className="rstats">
            <div className="rstat">
              <span className="rstat__label">Received</span>
              <span className="rstat__value">{shown.received}</span>
            </div>
            <div className="rstat">
              <span className="rstat__label">{committed ? 'Imported' : 'Would import'}</span>
              <span className="rstat__value">{shown.accepted ?? 0}</span>
            </div>
            <div className="rstat">
              <span className="rstat__label">Rejected</span>
              <span className="rstat__value">{shown.rejected?.length ?? 0}</span>
            </div>
            <div className="rstat">
              <span className="rstat__label">Duplicates</span>
              <span className="rstat__value">
                {(shown.duplicatesInFile?.length ?? 0) + (shown.duplicatesAgainstExisting?.length ?? 0)}
              </span>
            </div>
          </div>

          {shown.tier && (
            <div className="notice notice--info">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong>{TIER_LABEL[shown.tier]}</strong>
                <span className="wrap-any">{TIER_MEANS[shown.tier]}</span>
              </div>
            </div>
          )}

          {/* Never "imported successfully". Every row that did not land is
              named, by the line number in the operator's own file. */}
          {((shown.rejected?.length ?? 0) + (shown.duplicatesInFile?.length ?? 0) + (shown.duplicatesAgainstExisting?.length ?? 0)) > 0 && (
            <>
              <div className="section">
                <span className="eyebrow">Not imported, and why</span>
                <hr />
              </div>
              <div className="rows">
                {(shown.rejected ?? []).map((r, i) => (
                  <div className="row row--t2" key={`r${i}`}>
                    <span className="row__spine" />
                    <span className="row__body">
                      <span className="row__name">Line {r.row}</span>
                      <span className="row__why wrap-any" style={{ whiteSpace: 'normal' }}>{r.reason}</span>
                    </span>
                  </div>
                ))}
                {(shown.duplicatesInFile ?? []).map((d, i) => (
                  <div className="row row--t1" key={`d${i}`}>
                    <span className="row__spine" />
                    <span className="row__body">
                      <span className="row__name">Line {d.row}</span>
                      <span className="row__why wrap-any" style={{ whiteSpace: 'normal' }}>
                        duplicate — same {d.on} as line {String(d.matches)} ({d.value})
                      </span>
                    </span>
                  </div>
                ))}
                {(shown.duplicatesAgainstExisting ?? []).map((d, i) => (
                  <div className="row" key={`e${i}`}>
                    <span className="row__spine" />
                    <span className="row__body">
                      <span className="row__name">Line {d.row}</span>
                      <span className="row__why wrap-any" style={{ whiteSpace: 'normal' }}>
                        already a lead — {d.on} {d.value}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {preview && preview.candidates.length > 0 && !committed && (
            <>
              <div className="section">
                <span className="eyebrow">Preview</span>
                <hr />
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)' }}>{preview.candidates.length}</span>
              </div>
              <div className="rows">
                {preview.candidates.slice(0, 25).map((c) => (
                  <div className="lead-card" key={c.row}>
                    <span className="lead-card__av">{(c.full_name ?? '?').trim().charAt(0).toUpperCase()}</span>
                    <span className="lead-card__body">
                      <span className="lead-card__name">{c.full_name ?? '(no name)'}</span>
                      <span className="lead-card__sub">{c.phone ?? c.email ?? ''}</span>
                      <span className="lead-card__sub">
                        {[c.area, c.bedrooms !== null ? `T${c.bedrooms}` : null, c.consent_status].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="lead-card__end">
                      <span className="lead-card__budget">{money(c.budget_max ?? c.budget_min)}</span>
                      <span className="pill">line {c.row}</span>
                    </span>
                  </div>
                ))}
              </div>
              {preview.candidates.length > 25 && (
                <p className="hnote">Showing the first 25 of {preview.candidates.length}.</p>
              )}
              <CommitBar batchId={batch.id} accepted={preview.candidates.length} />
            </>
          )}
        </>
      )}

      {committed && (
        <>
          <div className="notice notice--ok">
            <span>
              {batch.created_lead_ids?.length ?? 0} leads imported on{' '}
              {new Date(batch.committed_at!).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.
            </span>
          </div>
          <RevertButton batchId={batch.id} count={batch.created_lead_ids?.length ?? 0} />
        </>
      )}

      {reverted && stored.revert && (
        <>
          <div className="notice notice--info">
            <IconWarning size={14} />
            <span>
              Undone — {stored.revert.removable.length} lead(s) removed. No message or event was deleted.
            </span>
          </div>
          {stored.revert.retained.length > 0 && (
            <>
              <div className="section">
                <span className="eyebrow">Kept, and why</span>
                <hr />
              </div>
              <div className="rows">
                {stored.revert.retained.map((r) => (
                  <div className="row row--t1" key={r.id}>
                    <span className="row__spine" />
                    <span className="row__body">
                      <span className="row__name wrap-any">{r.name ?? '(no name)'}</span>
                      <span className="row__why wrap-any" style={{ whiteSpace: 'normal' }}>{r.reason}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  )
}
