import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperator } from '@/lib/auth'
import { getLead, getQueue } from '@/lib/data'
import { TIER_WORD, classOf, formatWait, humanise } from '@/lib/escalation'
import { Shell, Who } from '@/components/Shell'
import { Chip } from '@/components/Queue'
import { Composer, HandBack } from '@/components/Reply'
import { IconBack, IconWarning } from '@/components/Icons'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function money(min: number | null, max: number | null): string | null {
  const hi = Math.max(Number(max ?? 0), Number(min ?? 0))
  if (!hi) return null
  if (hi >= 1_000_000) {
    const m = hi / 1_000_000
    return `€${(Math.round(m * 10) / 10).toString().replace(/\.0$/, '')}M`
  }
  return `€${Math.round(hi / 1000)}k`
}

function clock(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const operator = await requireOperator()
  const { id } = await params

  const [lead, queue] = await Promise.all([getLead(id), getQueue()])
  if (!lead) notFound()

  const budget = money(lead.budgetMin, lead.budgetMax)
  const tierClass = `card--t${lead.tier}`

  return (
    <Shell active="escalations" openCount={queue.length}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexGrow: 1 }}>
          <Link href="/queue" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
            <IconBack size={15} />
            <span style={{ fontSize: 12.5 }}>Escalations</span>
          </Link>
        </div>
        <Who email={operator.email} />
      </div>

      <div className="lead">
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="lead__head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <h1 className="lead__name">{lead.name}</h1>
              <span className="lead__meta">
                {lead.clientName}
                {lead.phone ? ` · ${lead.phone}` : ''}
              </span>
              {lead.escalated?.reasons.map((r, i) => (
                <span
                  key={`${r}-${i}`}
                  className="reason"
                  style={{ color: 'var(--t3)' }}
                >
                  {humanise(r)}
                </span>
              ))}
            </div>

            {lead.escalated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <div className="card__chips">
                  {lead.classes.map((c) => (
                    <Chip key={c} kind={c} />
                  ))}
                </div>
                <div className={`lead__age ${tierClass}`}>
                  <span className="age">{formatWait(lead.minutes)}</span>
                  <span className="tierword">{TIER_WORD[lead.tier]}</span>
                </div>
              </div>
            )}
          </div>

          {lead.handledElsewhere && (
            <div style={{ padding: '14px 22px 0' }}>
              <div className="elsewhere">
                <IconWarning size={15} />
                <span>
                  Someone already replied to this lead after it escalated, and it was not sent
                  from here. It is probably handled — hand it back to the AI, or reply again if
                  it is not.
                </span>
              </div>
            </div>
          )}

          <div className="thread">
            {lead.messages.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                No messages stored for this lead.
              </span>
            )}

            {lead.messages.map((m) => (
              <div key={m.id} className={`msg msg--${m.direction === 'inbound' ? 'in' : 'out'}`}>
                <div className="msg__bubble">{m.body ?? <em>(empty message)</em>}</div>
                <div className="msg__foot">
                  {m.direction === 'outbound' && m.aiGenerated && <span className="tag-ai">AI</span>}
                  {m.direction === 'outbound' && !m.aiGenerated && (
                    <span className="tag-ai">Human</span>
                  )}
                  {m.status === 'failed' && <span className="tag-failed">Failed</span>}
                  <span>{clock(m.createdAt)}</span>
                </div>
              </div>
            ))}

            {lead.escalated && (
              <div className="stopline">
                <IconWarning size={16} />
                <span>
                  The assistant stopped here and handed over
                  {lead.escalated.at ? ` at ${clock(lead.escalated.at)}` : ''}. It has not replied
                  since.
                </span>
              </div>
            )}
          </div>

          <Composer leadId={lead.id} firstName={lead.name.split(' ')[0]} />
        </div>

        <aside className="panel learned">
          <span className="eyebrow">What the AI learned</span>

          <div className="learned__row">
            <span className="learned__k">Budget</span>
            {budget ? (
              <span className="learned__big">{budget}</span>
            ) : (
              <span className="learned__none">Not established</span>
            )}
          </div>

          <div className="learned__row">
            <span className="learned__k">Timeline</span>
            <span className={lead.timeline ? 'learned__v' : 'learned__none'}>
              {lead.timeline ?? 'Not established'}
            </span>
          </div>

          <div className="learned__row">
            <span className="learned__k">Area</span>
            <span className={lead.area ? 'learned__v' : 'learned__none'}>
              {lead.area ?? 'Not established'}
            </span>
          </div>

          <div className="learned__row">
            <span className="learned__k">Lead type</span>
            <span className={lead.leadType ? 'learned__v' : 'learned__none'}>
              {lead.leadType ?? 'Unknown'}
            </span>
          </div>

          <div className="learned__row">
            <span className="learned__k">Stage</span>
            <span className="pill">{lead.stage ?? 'new'}</span>
          </div>

          <div className="learned__row">
            <span className="learned__k">Viewing</span>
            {lead.viewing ? (
              <span className="learned__v">
                {lead.viewing.startsAt ? clock(lead.viewing.startsAt) : 'Booked'}
              </span>
            ) : (
              <span className="learned__none">None booked</span>
            )}
          </div>

          {lead.escalated && <HandBack leadId={lead.id} />}

          <hr style={{ border: 'none', height: 1, background: 'var(--hairline)', margin: 0 }} />

          <div className="learned__row" style={{ gap: 6 }}>
            <span className="learned__k">Escalation reasons</span>
            {(lead.escalated?.reasons ?? []).map((r, i) => (
              <span key={`${r}-${i}`} className={`rawreason rawreason--${classOf(r)}`}>
                {r}
              </span>
            ))}
            {(!lead.escalated || lead.escalated.reasons.length === 0) && (
              <span className="learned__none">Not escalated</span>
            )}
            <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--ink-4)' }}>
              Every entry of reasons[], not just the first.
            </span>
          </div>
        </aside>
      </div>
    </Shell>
  )
}
