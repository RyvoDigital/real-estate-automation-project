// ============================================================================
// Which escalation reasons mean SOMETHING BROKE. Shared source: the one list.
//
// Embedded verbatim into PrepRunEscalated, where a system reason makes the run
// status='error'. Mirrored by cockpit/src/lib/system-reasons.ts for the
// escalation screen's "system" class; cockpit/tests/system-reasons.test.ts
// fails if the two ever differ.
//
// A retired booking is NOT here, deliberately (decided 21 Sep 2026). The
// calendar losing or cancelling an appointment is a business event that a
// person must act on (rebook, and the lead has already been told by a fixed
// note), not a dependency failing. Until 21 Sep the cockpit listed it and n8n
// did not, so the same escalation was 'success' in the run row and "system"
// on the escalation screen, while the cockpit's comment claimed the two
// matched "exactly".
//
// A LOST RACE is not here either (decided 22 Sep 2026). Two leads confirming the
// same slot at once is the calendar working: the re-check or Google's 409 stopped
// the second booking, the lead was told in their language, and a person offers a
// new time. AfterBooking writes it as its own head, booking_lost_race:<detail>,
// and keeps booking_failed:<result> for a calendar or API that actually failed
// (failed, recheck_failed, conflict_burned_id), which stays a system failure.
// Until 22 Sep the race was booking_failed:slot_taken, so every lost race was an
// error run and a "system" escalation (the booking gate, four in four).
// ============================================================================
const SYSTEM_REASON_HEADS = ['claude_failed', 'bad_reply_twice', 'booking_failed', 'no_availability', 'media_unprocessable'];
const SYSTEM_REASONS = new RegExp('^(' + SYSTEM_REASON_HEADS.join('|') + ')');
