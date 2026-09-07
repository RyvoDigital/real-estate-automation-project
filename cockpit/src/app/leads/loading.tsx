import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell active="leads" eyebrow="Loading" title="Leads" note="Loading leads…">
      <div className="searchrow" aria-hidden>
        <Bar h={52} r={15} />
      </div>
      {['Client', 'Stage', 'Waiting'].map((label) => (
        <div className="filters__group" key={label} aria-hidden>
          <span className="filters__label">{label}</span>
          <div className="filters">
            <Bar w={96} h={44} r={15} />
            <Bar w={132} h={44} r={15} />
            <Bar w={110} h={44} r={15} />
          </div>
        </div>
      ))}
      <div className="rows lead-grid" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div className="lead-card" key={i} style={{ opacity: 1 - i * 0.28 }}>
            <span className="lead-card__av skeleton" />
            <span className="lead-card__body" style={{ gap: 7 }}>
              <Bar w="52%" h={15} />
              <Bar w="38%" h={12} />
              <Bar w="44%" h={12} />
            </span>
          </div>
        ))}
      </div>
    </SkeletonShell>
  )
}
