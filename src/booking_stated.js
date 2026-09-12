// ============================================================================
// If the workflow books a meeting this turn, the reply must say so. — shared
// source. Embedded verbatim into ParseClaude and ParseGuardRetry. Unit-tested
// standalone in tests/booking_stated.test.js, which loads THIS file.
//
// WHY THIS EXISTS
// On 2026-09-12 the matcher read "the first meeting" as "the first slot" and a
// calendar event was created under a reply that talked about documents. The
// calendar knew; the lead did not; the agent would have found out on Monday.
// Even with a perfect matcher, a confirmation the lead is never told about is
// invisible to everyone until someone turns up. So: a booking made this turn
// is stated in the reply, or it is not made.
//
// THE RULE
// When the workflow is about to create an event, the reply must name that
// slot: its clock time, and its weekday or day of month, in any of the three
// languages. A draft that does not gets ONE targeted retry that says what to
// state. If the retry still does not state it, the booking is WITHHELD -- no
// event is created, the offer stays on the row, the reply goes out -- and a
// warning event records it. A booking that did not happen is recoverable in
// one message; a booking the lead was never told about is not.
// ============================================================================

const STATED_WEEKDAYS = [
  ['segunda', 'monday', 'lunes'], ['terca', 'tuesday', 'martes'], ['quarta', 'wednesday', 'miercoles'],
  ['quinta', 'thursday', 'jueves'], ['sexta', 'friday', 'viernes'], ['sabado', 'saturday'], ['domingo', 'sunday'],
];

function deaccentStated(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// slotParts(slot) -> { hour, minute, weekday (1-7), day } from the slot's LOCAL
// time string ("2026-09-14T09:00:00.000+01:00"), so no timezone library is
// needed here and the check reads exactly what the lead was shown.
function slotParts(slot) {
  const local = String((slot && slot.local) || '');
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();   // 0 = Sunday
  return { hour: Number(m[4]), minute: m[5], weekday: wd === 0 ? 7 : wd, day: d };
}

// replyStatesSlot(reply, slot) -> true when the reply names the slot's time
// AND its day (weekday name or day of month). Both, so "at 09:00" alone --
// which every offer list contains -- is not taken as a confirmation.
function replyStatesSlot(reply, slot) {
  const parts = slotParts(slot);
  if (!parts) return false;
  const t = deaccentStated(reply);
  const timeRx = new RegExp('\\b0?' + parts.hour + '[:h]' + parts.minute + '\\b|\\b0?' + parts.hour + '\\s*h\\b');
  if (!timeRx.test(t)) return false;
  const names = STATED_WEEKDAYS[parts.weekday - 1] || [];
  const hasWeekday = names.some(n => t.includes(n));
  const hasDay = new RegExp('\\b(dia\\s+)?' + parts.day + '(?:st|nd|rd|th|o|a)?\\b').test(t);
  return hasWeekday || hasDay;
}

// retryBookingHint(slotText) -> the line for the ONE targeted retry.
function retryBookingHint(slotText) {
  return '\n\nYOUR PREVIOUS DRAFT WAS REJECTED: the meeting for ' + slotText + ' has just been '
    + 'booked and your reply did not say so. State plainly, in the lead\'s language, that the '
    + 'first meeting is confirmed for ' + slotText + ' - the weekday, the date and the time - '
    + 'then answer anything else they asked. Keep it short.';
}
