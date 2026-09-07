import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell
      active="queue"
      eyebrow="Loading"
      title="Lead"
      note="Loading the conversation…"
    >
      <div className="detail" aria-hidden>
        <div className="panel">
          <div className="detail__head">
            <Bar w="60%" h={30} r={8} />
            <Bar w="45%" h={13} />
          </div>
          <div className="thread">
            {[
              ['in', '62%'],
              ['out', '86%'],
              ['in', '48%'],
              ['out', '74%'],
            ].map(([side, w], i) => (
              <div className={`msg msg--${side}`} key={i} style={{ width: w }}>
                <Bar h={52} r={18} />
              </div>
            ))}
          </div>
        </div>
        <aside className="panel">
          <div className="learned">
            <span className="eyebrow">What the AI learned</span>
            {[0, 1, 2, 3].map((i) => (
              <div className="learned__row" key={i} style={{ gap: 7 }}>
                <Bar w={72} h={10} r={4} />
                <Bar w="58%" h={16} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </SkeletonShell>
  )
}
