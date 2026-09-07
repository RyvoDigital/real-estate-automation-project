import { SkeletonShell } from '@/components/Skeleton'

/**
 * The health screen's placeholder deliberately shows NO checks.
 *
 * Every other skeleton here mirrors the shape of what is coming, because that
 * stops the layout shifting. This one must not: a row of grey check-shaped
 * boxes says "here are some checks" before anything has been read, and a
 * health screen that looks populated while it knows nothing is precisely the
 * failure §5.6 exists to prevent. It says it has not read yet, and nothing
 * else.
 *
 * It is also why probe:health can keep counting `.hcheck` rows in the served
 * HTML. A streamed response contains the skeleton AND the real content, so a
 * placeholder that borrowed the row class would have been counted as a check
 * that the producer never published.
 */
export default function Loading() {
  return (
    <SkeletonShell
      active="health"
      eyebrow="Twelve checks"
      title="Health"
      note="Reading the last run…"
    >
      <div className="hstamp">
        <div className="hstamp__main">
          <span className="eyebrow">Last run</span>
          <span className="hstamp__abs" style={{ color: 'var(--ink-3)' }}>
            Not read yet
          </span>
          <span className="hstamp__rel">
            Nothing on this screen has been checked against the database yet.
          </span>
        </div>
      </div>
    </SkeletonShell>
  )
}
