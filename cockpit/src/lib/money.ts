/**
 * A budget is a RANGE. On 2026-09-11 a lead said "1.2 to 1.5 million", both
 * bounds were stored, and the cockpit showed "€1.5M" — the page took the larger
 * of the two and threw the other away. An agent reading €1.5M prepares a
 * different shortlist from one reading €1.2M–€1.5M, and the matcher
 * (Automation 03) searches the band, so the screen must show the band.
 */
export function moneyShort(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.round((n / 1_000_000) * 10) / 10
    return `€${m.toString().replace(/\.0$/, '')}M`
  }
  return `€${Math.round(n / 1000)}k`
}

/** "€1.2M–€1.5M", "€900k" for a single bound or a point range, null when unknown. */
export function budgetLabel(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = Number(min ?? 0) || 0
  const hi = Number(max ?? 0) || 0
  if (!lo && !hi) return null
  if (!lo || !hi || lo === hi) return moneyShort(lo || hi)
  if (lo > hi) return `${moneyShort(hi)}–${moneyShort(lo)} (inverted on the row)`
  return `${moneyShort(lo)}–${moneyShort(hi)}`
}
