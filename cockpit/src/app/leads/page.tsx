import Link from 'next/link'
import { requireOperator } from '@/lib/auth'
import { STAGES, getClients, getLeads, getQueue, type LeadFilters } from '@/lib/data'
import { formatWait } from '@/lib/escalation'
import { Shell, Who } from '@/components/Shell'
import { IconWarning } from '@/components/Icons'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function money(n: number | null): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `€${(Math.round((n / 1_000_000) * 10) / 10).toString().replace(/\.0$/, '')}M`
  return `€${Math.round(n / 1000)}k`
}

function ago(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Preserve every other filter when one changes — losing a filter on each
 *  click is what makes a list screen feel hostile. */
function href(current: LeadFilters, patch: Partial<LeadFilters>): string {
  const next = { ...current, ...patch }
  if (!('page' in patch)) next.page = 1
  const p = new URLSearchParams()
  if (next.client) p.set('client', next.client)
  if (next.stage) p.set('stage', next.stage)
  if (next.escalated) p.set('escalated', next.escalated)
  if (next.q) p.set('q', next.q)
  if (next.page && next.page > 1) p.set('page', String(next.page))
  const s = p.toString()
  return s ? `/leads?${s}` : '/leads'
}

export default async function AllLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const operator = await requireOperator()
  const sp = await searchParams

  const filters: LeadFilters = {
    client: sp.client || undefined,
    stage: sp.stage || undefined,
    escalated: sp.escalated === 'yes' || sp.escalated === 'no' ? sp.escalated : undefined,
    q: sp.q || undefined,
    page: sp.page ? Number(sp.page) : 1,
  }

  const [{ rows, total, page, pages }, clients, queue] = await Promise.all([
    getLeads(filters),
    getClients(),
    getQueue(),
  ])

  return (
    <Shell active="leads" openCount={queue.length}>
      <div className="topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1 }}>
          <h1 className="topbar__title">Leads</h1>
          <span className="topbar__sub">
            {total} across {clients.length} client{clients.length === 1 ? '' : 's'}
            {total > 0 ? ` · showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, total)}` : ''}
          </span>
        </div>
        <Who email={operator.email} />
      </div>

      <form className="filters" action="/leads" method="get">
        {filters.client && <input type="hidden" name="client" value={filters.client} />}
        {filters.stage && <input type="hidden" name="stage" value={filters.stage} />}
        {filters.escalated && <input type="hidden" name="escalated" value={filters.escalated} />}
        <input
          className="filters__search"
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="Name or phone"
          aria-label="Search leads"
        />
        <button className="btn-ghost" type="submit">
          Search
        </button>
      </form>

      <div className="filters__rows">
        <div className="chips">
          <span className="chips__label">Client</span>
          <Link className={`fchip${!filters.client ? ' fchip--on' : ''}`} href={href(filters, { client: undefined })}>
            All
          </Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              className={`fchip${filters.client === c.id ? ' fchip--on' : ''}`}
              href={href(filters, { client: c.id })}
            >
              {c.name}
            </Link>
          ))}
        </div>

        <div className="chips">
          <span className="chips__label">Stage</span>
          <Link className={`fchip${!filters.stage ? ' fchip--on' : ''}`} href={href(filters, { stage: undefined })}>
            Any
          </Link>
          {STAGES.map((s) => (
            <Link
              key={s}
              className={`fchip${filters.stage === s ? ' fchip--on' : ''}`}
              href={href(filters, { stage: s })}
            >
              {s.replace(/_/g, ' ')}
            </Link>
          ))}
        </div>

        <div className="chips">
          <span className="chips__label">Waiting</span>
          <Link className={`fchip${!filters.escalated ? ' fchip--on' : ''}`} href={href(filters, { escalated: undefined })}>
            Any
          </Link>
          <Link className={`fchip${filters.escalated === 'yes' ? ' fchip--on' : ''}`} href={href(filters, { escalated: 'yes' })}>
            Escalated
          </Link>
          <Link className={`fchip${filters.escalated === 'no' ? ' fchip--on' : ''}`} href={href(filters, { escalated: 'no' })}>
            Not escalated
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <h2>No leads match</h2>
          <p>Nothing here fits those filters. Clear one and try again.</p>
        </div>
      ) : (
        <div className="table">
          <div className="table__head">
            <span>Lead</span>
            <span>Client</span>
            <span>Stage</span>
            <span>Budget</span>
            <span>Area</span>
            <span>Last contact</span>
          </div>
          {rows.map((r) => (
            <Link key={r.id} href={`/leads/${r.id}`} className="table__row">
              <span className="table__lead">
                <span className="table__name">{r.name}</span>
                {r.phone && <span className="table__sub">{r.phone}</span>}
              </span>
              <span className="table__cell">{r.clientName}</span>
              <span className="table__cell">
                <span className="pill pill--sm">{r.stage.replace(/_/g, ' ')}</span>
              </span>
              <span className="table__cell mono">{money(r.budget)}</span>
              <span className="table__cell">{r.area ?? '—'}</span>
              <span className="table__cell">
                {r.escalated ? (
                  <span className="table__waiting">
                    <IconWarning size={12} /> {formatWait(r.minutes)}
                  </span>
                ) : (
                  ago(r.lastContactAt)
                )}
              </span>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          {page > 1 ? (
            <Link className="btn-ghost" href={href(filters, { page: page - 1 })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="pager__at">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link className="btn-ghost" href={href(filters, { page: page + 1 })}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </Shell>
  )
}
