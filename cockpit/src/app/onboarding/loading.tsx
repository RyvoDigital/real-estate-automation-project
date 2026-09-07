import { SkeletonShell, Bar } from '@/components/Skeleton'

export default function Loading() {
  return (
    <SkeletonShell
      active="more"
      eyebrow="Onboarding"
      title="New client"
      note="Opening the form…"
    >
      <div className="onb" aria-hidden>
        <div className="steps">
          {['Agency', 'Voice', 'Booking', 'Escalation', 'Review'].map((s, i) => (
            <span className={`step${i === 0 ? ' step--on' : ''}`} key={s}>
              <span className="step__n">{i + 1}</span>
              {s}
            </span>
          ))}
        </div>
        <div className="opanel">
          <Bar w="34%" h={26} r={8} />
          <div className="ogrid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div className="ofield" key={i}>
                <Bar w={110} h={11} r={4} />
                <Bar h={52} r={15} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonShell>
  )
}
