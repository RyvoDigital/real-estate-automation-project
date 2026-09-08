import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell active="import" eyebrow="Contact list" title="Reading…" note="Reading the file…">
      <div className="opanel" aria-hidden>
        <Bar w="38%" h={26} r={8} />
        <div className="maprows">
          {[0, 1, 2, 3].map((i) => (
            <div className="maprow" key={i}>
              <span className="maprow__col" style={{ gap: 7 }}>
                <Bar w="30%" h={14} />
                <Bar w="55%" h={11} r={5} />
              </span>
              <span className="maprow__pick">
                <Bar h={52} r={15} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </SkeletonShell>
  )
}
