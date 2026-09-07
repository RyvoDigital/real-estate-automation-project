import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell
      active="report"
      eyebrow="From metrics_daily only"
      title="Weekly report"
      note="Reading metrics_daily…"
    >
      <div className="rsheet" aria-hidden>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Bar w={120} h={11} r={4} />
          <Bar w="46%" h={30} r={8} />
          <Bar w="62%" h={13} />
        </div>
        <div className="rstats">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="rstat" key={i}>
              <Bar w="70%" h={11} r={4} />
              <Bar w={44} h={34} r={8} />
            </div>
          ))}
        </div>
        <div className="rweek">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div className="rday" key={i}>
              <span className="rday__track" />
              <Bar w={26} h={11} r={4} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonShell>
  )
}
