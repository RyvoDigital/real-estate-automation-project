import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { getClients, getOpenCount } from '@/lib/data'
import { listBatches } from '@/lib/import/store'
import { Shell } from '@/components/Shell'
import { UploadForm } from '@/components/Import'
import { TIER_LABEL } from '@/lib/import/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const STATUS: Record<string, string> = { staged: 'Not imported yet', committed: 'Imported', reverted: 'Undone' }

export default async function ImportPage() {
  const operator = await requireOperator()
  const [clients, openCount, batches] = await Promise.all([getClients(), getOpenCount(), listBatches()])

  return (
    <Shell active="import" openCount={openCount} email={operator.email}>
      <header className="head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">Contact lists</span>
          <h1 className="head__title">Import</h1>
        </div>
      </header>

      {clients.length === 0 ? (
        <div className="empty">
          <h2>No clients yet</h2>
          <p>Onboard one first — a contact list has to belong to somebody.</p>
        </div>
      ) : (
        <UploadForm clients={clients} />
      )}

      {batches.length > 0 && (
        <>
          <div className="section">
            <span className="eyebrow">Previous imports</span>
            <hr />
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)' }}>{batches.length}</span>
          </div>
          <div className="rows">
            {batches.map((b) => {
              const r = b.report ?? {}
              return (
                <Link href={`/import/${b.id}`} className="row" key={b.id}>
                  <span className="row__spine" />
                  <span className="row__body">
                    <span className="row__name wrap-any">{b.filename}</span>
                    <span className="row__why">
                      {STATUS[b.status] ?? b.status}
                      {b.status === 'committed' ? ` · ${b.created_lead_ids?.length ?? 0} leads` : ''}
                      {b.tier ? ` · ${TIER_LABEL[b.tier as keyof typeof TIER_LABEL]}` : ''}
                    </span>
                  </span>
                  <span className="row__end">
                    <span className="row__age">{new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    {typeof r.accepted === 'number' && (
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                        {r.accepted}/{r.received}
                      </span>
                    )}
                  </span>
                </Link>
              )
            })}
          </div>
        </>
      )}
    </Shell>
  )
}
