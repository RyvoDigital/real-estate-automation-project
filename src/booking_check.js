// ============================================================================
// Is the booking we stored still real? — shared source.
//
// Embedded verbatim into ResolveBooking. Unit-tested standalone in
// tests/booking_check.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On 2026-09-11 a lead was told, on every message for an hour, that a first
// meeting was already booked -- so the model never offered times, and the
// stage sat at viewing_booked while the lead was being re-qualified. The
// booking had been created on 5 September and was genuine (Google returned
// the event). By the rehearsal the slot was in the past and the event was no
// longer in the calendar. Nothing had looked at it since the day it was made.
//
// THE RULE
// A stored booking is a CLAIM about the calendar. Before the model is told an
// appointment exists, the claim is checked against the calendar, and against
// the clock. Three outcomes retire it -- the slot has passed, Google says the
// event is cancelled, or Google says it is gone -- and one keeps it with a
// warning: the calendar could not be read. That last case is stated to the
// operator as an event, not only to the model in the prompt, because a Google
// outage that silently changes booking behaviour is the silent-failure
// pattern this project keeps hitting.
//
// The bias, when unsure, is to KEEP the booking and say so. Retiring a real
// booking because of a transient 503 would let the model offer a second
// appointment on top of a first one that still exists.
// ============================================================================

// resolveBookingCheck(existing, httpResponse, nowMs) ->
//   { check, retire, error, googleStatus }
//
//   existing      the stored booking: { event_id, startUtc, endUtc, ... }
//   httpResponse  the events.get envelope { statusCode, body } or null
//   nowMs         the clock, injected so the tests can move it
//
//   check   'past' | 'cancelled' | 'missing' | 'confirmed' | 'unreadable'
//   retire  true when the booking must stop being asserted
//   error   a short reason string for 'unreadable', else null
function resolveBookingCheck(existing, httpResponse, nowMs) {
  const eb = existing || {};
  const res = httpResponse || {};
  const code = typeof res.statusCode === 'number' ? res.statusCode : null;
  const body = res.body || {};

  // The clock wins over the calendar: a slot that has ended is not upcoming
  // whatever Google says about it, and it needs no Google to say so.
  const endMs = Date.parse(eb.endUtc || eb.startUtc || '');
  if (Number.isFinite(endMs) && endMs <= nowMs) {
    return { check: 'past', retire: true, error: null, googleStatus: code };
  }

  if (code !== null && code >= 200 && code < 300) {
    if (body.status === 'cancelled') {
      return { check: 'cancelled', retire: true, error: null, googleStatus: code };
    }
    return { check: 'confirmed', retire: false, error: null, googleStatus: code };
  }
  if (code === 404 || code === 410) {
    return { check: 'missing', retire: true, error: null, googleStatus: code };
  }
  const msg = body.error && body.error.message ? ':' + String(body.error.message).slice(0, 120) : '';
  return { check: 'unreadable', retire: false,
           error: 'events_get_http_' + (code === null ? 'none' : code) + msg,
           googleStatus: code };
}
