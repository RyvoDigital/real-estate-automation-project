import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell
      active="queue"
      eyebrow="Waiting on you"
      title="Escalations"
      note="Loading the queue…"
    >
      <div className="hero hero--t0" aria-hidden>
        <span className="hero__top">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bar w={84} h={11} r={5} />
            <Bar w={150} h={46} r={10} />
          </span>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Bar w="62%" h={19} r={7} />
          <Bar w="80%" h={13} />
        </span>
        <Bar h={58} r={16} />
        <Bar h={50} r={16} />
      </div>

      <div className="rows" aria-hidden>
        {[0, 1].map((i) => (
          <div className="row" key={i} style={{ opacity: 1 - i * 0.35 }}>
            <span className="row__spine" />
            <span className="row__body" style={{ gap: 7 }}>
              <Bar w="55%" h={14} />
              <Bar w="38%" h={11} r={5} />
            </span>
            <Bar w={54} h={15} />
          </div>
        ))}
      </div>
    </SkeletonShell>
  )
}
