import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell active="import" eyebrow="Contact lists" title="Import" note="Opening…">
      <div className="opanel" aria-hidden>
        <Bar w="42%" h={26} r={8} />
        <div className="ogrid">
          {[0, 1].map((i) => (
            <div className="ofield" key={i}>
              <Bar w={90} h={11} r={4} />
              <Bar h={52} r={15} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonShell>
  )
}
