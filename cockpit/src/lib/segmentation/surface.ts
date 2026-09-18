/**
 * A surface is a background AND the text that sits on it. Never one alone.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ THE CLAIM PANEL RENDERED NEAR-WHITE TEXT ON A NEAR-WHITE BACKGROUND.    │
 * │                                                                         │
 * │ It set `background: '#fbf6f3'` and no `color`, so the text stayed the   │
 * │ browser default — white, on a machine in dark mode — against a surface  │
 * │ pinned light. The three load-bearing sentences were invisible on the    │
 * │ one screen that exists to say them. The error and success boxes had the │
 * │ same bug, which is worse: an error message nobody can read, in a        │
 * │ meeting, looks exactly like a screen where nothing went wrong.          │
 * │                                                                         │
 * │ Pinning a background without pinning a foreground is not a style        │
 * │ oversight, it is a half-specified contract: it inherits one half of the │
 * │ pair from an environment that is free to change it.                     │
 * │                                                                         │
 * │ So surfaces come from here, in pairs, and segmentation.test.ts computes │
 * │ the actual WCAG contrast of every pair. The page carries no background  │
 * │ literal of its own — a guard enforces that too, because the next one    │
 * │ added by hand would reintroduce exactly this.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The cockpit redesign will replace all of this. The pairing must survive it:
 * what is being defended is not these hex values, it is that text and the thing
 * behind it are decided together.
 */

export type Surface = {
  background: string
  color: string
  /** Secondary text ON THIS SURFACE. Also contrast-checked. */
  muted: string
}

export const SURFACE: Record<'page' | 'note' | 'error' | 'ok', Surface> = {
  page: { background: '#ffffff', color: '#1b1b1b', muted: '#595959' },
  note: { background: '#fbf6f3', color: '#2a1f18', muted: '#5f5046' },
  error: { background: '#fdf0ee', color: '#4a1a10', muted: '#6b3226' },
  ok: { background: '#f1f7f1', color: '#16351a', muted: '#3a5a3d' },
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const v = hex.replace('#', '')
  const ch = [0, 2, 4].map((i) => {
    const s = parseInt(v.slice(i, i + 2), 16) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG contrast ratio, 1 (invisible) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
