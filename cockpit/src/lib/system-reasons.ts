/**
 * MIRROR of src/system_reasons.js: the escalation reasons that mean something
 * BROKE. That file is the source; n8n embeds it in PrepRunEscalated.
 *
 * Why a mirror and not an import: the cockpit builds on Vercel from
 * cockpit/ (it has its own vercel.json), and a file outside that directory is
 * not guaranteed to be in the build. So the list is copied ONCE, here, and
 * tests/system-reasons.test.ts reads src/system_reasons.js and fails if the two
 * differ. Change the source first, then this.
 *
 * A retired booking is not a system failure (21 Sep 2026): see the source.
 */
export const SYSTEM_REASON_HEADS = ['claude_failed', 'bad_reply_twice', 'booking_failed', 'no_availability', 'media_unprocessable'] as const

export const SYSTEM = new RegExp('^(' + SYSTEM_REASON_HEADS.join('|') + ')')
