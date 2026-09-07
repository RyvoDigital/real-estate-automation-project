import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell
      active="more"
      eyebrow="Twelve checks"
      title="Health"
      note="Reading the last run…"
    >
      {/*
        Deliberately NOT a grey box where the last-run stamp goes. A health
        screen that looks calm while it knows nothing is the exact failure §5.6
        exists to prevent, so the placeholder says it has no result yet.
      */}
      <div className="hstamp" aria-hidden>
        <div className="hstamp__main">
          <span className="eyebrow">Last run</span>
          <span className="hstamp__abs" style={{ color: 'var(--ink-3)' }}>
            Not read yet
          </span>
        </div>
      </div>
      <div className="hchecks" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="hcheck" key={i} style={{ opacity: 1 - i * 0.12 }}>
            <span className="hcheck__dot" style={{ background: 'var(--ink-4)' }} />
            <span className="hcheck__text">
              <Bar w={`${75 - i * 6}%`} h={13} />
            </span>
          </div>
        ))}
      </div>
    </SkeletonShell>
  )
}
