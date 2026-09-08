'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveMapping, commit, refineMapping, revert, uploadList, type ActionResult } from '@/lib/import/actions'
import type { ProposedColumn, Target } from '@/lib/import/types'
import { IconWarning } from './Icons'

const TARGETS: { value: Target; label: string }[] = [
  { value: 'ignore', label: "Don't import" },
  { value: 'full_name', label: 'Name' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'budget_range', label: 'Budget (range)' },
  { value: 'budget_min', label: 'Budget — minimum' },
  { value: 'budget_max', label: 'Budget — maximum' },
  { value: 'area', label: 'Area' },
  { value: 'property_type', label: 'Property type' },
  { value: 'bedrooms', label: 'Bedrooms' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'last_contact_at', label: 'Last contact' },
  { value: 'notes', label: 'Notes — what they said' },
  { value: 'consent', label: 'Consent' },
  { value: 'source', label: 'Source' },
]

function Notice({ r }: { r: ActionResult | null }) {
  if (!r) return null
  return (
    <div className={`notice notice--${r.ok ? 'ok' : 'bad'}`} role="status">
      {!r.ok && <IconWarning size={14} />}
      <span className="wrap-any">{r.message}</span>
    </div>
  )
}

export function UploadForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <form
      className="opanel"
      action={(fd) =>
        start(async () => {
          const r = await uploadList(fd)
          setResult(r)
          if (r.ok && r.batchId) router.push(`/import/${r.batchId}`)
        })
      }
    >
      <div>
        <h2>Import a contact list</h2>
        <span className="opanel__sub">
          CSV, Excel or vCard — whatever they already have. Nothing is written until you have seen
          what would land.
        </span>
      </div>

      <div className="ogrid">
        <label className="ofield">
          <span className="ofield__label">Client</span>
          <select className="field" name="clientId" required defaultValue={clients[0]?.id}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ofield">
          <span className="ofield__label">File</span>
          <input className="field field--file" type="file" name="file" required accept=".csv,.tsv,.txt,.xlsx,.xlsm,.vcf,.vcard" />
        </label>
      </div>

      <Notice r={result} />

      <div className="ofoot">
        <span className="ofoot__mid">Reading a file writes nothing. You review the mapping first.</span>
        <div className="ofoot__row">
          <button className="btn btn--primary" type="submit" disabled={pending}>
            {pending ? 'Reading…' : 'Read the file'}
          </button>
        </div>
      </div>
    </form>
  )
}

export function MappingReview({
  batchId,
  columns,
  note,
  by,
  approved,
}: {
  batchId: string
  columns: ProposedColumn[]
  note?: string
  by: string
  approved: boolean
}) {
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  return (
    <form className="opanel" action={(fd) => start(async () => setResult(await approveMapping(batchId, fd)))}>
      <div>
        <h2>What each column is</h2>
        <span className="opanel__sub">
          {by === 'headers+model'
            ? 'Proposed from the headers and the sample values, then checked by Claude. Correct anything wrong — it is asked once and remembered for this client.'
            : 'Proposed from the headers and the sample values. Correct anything wrong — it is asked once and remembered for this client.'}
        </span>
      </div>

      {note && (
        <div className="notice notice--info">
          <span className="wrap-any">{note}</span>
        </div>
      )}

      <div className="maprows">
        {columns.map((c) => (
          <div className="maprow" key={c.column}>
            <div className="maprow__col">
              <span className="maprow__name wrap-any">{c.column}</span>
              <span className="maprow__why wrap-any">{c.why}</span>
              {c.samples.length > 0 && (
                <span className="maprow__samples wrap-any">{c.samples.map((s) => `“${s}”`).join('  ')}</span>
              )}
            </div>
            <label className="maprow__pick">
              <span className="ofield__label">Import as</span>
              <select className="field" name={`col:${c.column}`} defaultValue={c.target}>
                {TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>

      <Notice r={result} />

      <div className="ofoot">
        <span className="ofoot__mid">
          {approved ? 'Saved for this client. Changing it here changes it for the next import too.' : 'Nothing is written until you commit.'}
        </span>
        <div className="ofoot__row">
          <RefineButton batchId={batchId} />
          <button className="btn btn--primary" type="submit" disabled={pending}>
            {pending ? 'Checking…' : approved ? 'Update and preview' : 'Save and preview'}
          </button>
        </div>
      </div>
    </form>
  )
}

function RefineButton({ batchId }: { batchId: string }) {
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <button
        className="btn btn--ghost"
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await refineMapping(batchId)))}
        title="Sends the column headers and up to five sample values per column"
      >
        {pending ? 'Asking Claude…' : 'Ask Claude'}
      </button>
      {result && !result.ok && (
        <span className="maprow__why wrap-any" style={{ alignSelf: 'center' }}>
          {result.message}
        </span>
      )}
    </>
  )
}

export function CommitBar({ batchId, accepted }: { batchId: string; accepted: number }) {
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="stack">
      <Notice r={result} />
      <div className="ofoot">
        <span className="ofoot__mid">
          This writes {accepted} lead{accepted === 1 ? '' : 's'}. The rows listed above are not written, and
          you can undo this afterwards.
        </span>
        <div className="ofoot__row">
          <button
            className="btn btn--primary"
            type="button"
            disabled={pending || accepted === 0}
            onClick={() => start(async () => setResult(await commit(batchId)))}
          >
            {pending ? 'Importing…' : `Import ${accepted}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RevertButton({ batchId, count }: { batchId: string; count: number }) {
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  if (result?.ok) return <div className="notice notice--ok"><span>{result.message}</span></div>

  return (
    <div className="handback">
      <Notice r={result && !result.ok ? result : null} />
      {!confirming ? (
        <button className="btn btn--ghost" type="button" onClick={() => setConfirming(true)}>
          Undo this import
        </button>
      ) : (
        <div className="handback__confirm">
          <span>
            This removes the {count} lead{count === 1 ? '' : 's'} it created — but only those nobody has
            spoken to since. Any lead with a message or an event is kept and named. No message or
            event is ever deleted.
          </span>
          <div className="handback__actions">
            <button className="btn btn--ghost" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              type="button"
              disabled={pending}
              onClick={() => start(async () => { setResult(await revert(batchId)); setConfirming(false) })}
            >
              {pending ? 'Undoing…' : 'Yes, undo it'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
