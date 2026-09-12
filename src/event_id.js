// ============================================================================
// The next free generation of a slot-keyed event id — shared source.
//
// Embedded verbatim into ReadSlotEvents. Unit-tested standalone in
// tests/event_id.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// The event id is derived from the slot (rv<calendarKey><slotUtc>) so that two
// leads confirming the same time produce the SAME id and Google's 409 is the
// lock -- atomic, server-side, in the system that owns the calendar. The cost,
// recorded when it was chosen: Google keeps every id it has ever seen, so
// deleting an event retired that slot from automated booking for ever. By
// 2026-09-12 three slots in the demo week were burned, all by test cleanup,
// and a lead was offered a time (free/busy does not see deleted events) that
// then failed at the moment of commitment.
//
// THE RULE
// Immediately before the create, the calendar is listed for the slot window
// WITH deleted events included, and the id gets a generation suffix: the base
// id if nothing has ever used it, otherwise base + 'g' + n for the smallest n
// not yet seen. Two leads racing the same slot list the same calendar, see the
// same ids, compute the same next id, and the 409 still arbitrates exactly as
// before. A deleted event simply moves the next attempt to a fresh id.
//
// 'g' is inside Google's base32hex alphabet ([a-v0-9]), so the id stays valid.
// The base id (generation 0) is unchanged, so every id created before this
// change is still matched, verified and retired by its stored value.
//
// If Google ever answers a 409 for an id this function thought was free (an id
// purged from the listing but still reserved), ResolveConflict's burned_id
// path still catches it and escalates rather than double-booking. This is a
// fix for the common case, with the old backstop intact behind it.
// ============================================================================

// nextEventId(baseId, items) -> { id, generation, seen }
//   baseId  the slot-derived id, e.g. rvc99e66fba61fe0ee20260916080000000
//   items   events.list items for the slot window, showDeleted=true
function nextEventId(baseId, items) {
  const base = String(baseId || '');
  const seen = new Set();
  for (const e of (Array.isArray(items) ? items : [])) {
    const id = e && e.id != null ? String(e.id) : '';
    if (id === base || (id.indexOf(base + 'g') === 0 && /^\d+$/.test(id.slice(base.length + 1)))) seen.add(id);
  }
  let n = 0, id = base;
  while (seen.has(id) && n < 1000) { n++; id = base + 'g' + n; }
  return { id, generation: n, seen: seen.size };
}
