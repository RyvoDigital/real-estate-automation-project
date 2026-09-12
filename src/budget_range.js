// ============================================================================
// A budget is ONE fact with two bounds, not two facts. — shared source.
//
// Embedded verbatim into MergeLeadFields. Unit-tested standalone in
// tests/budget_range.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On 2026-09-11 a lead said "1.2 to 1.5 million" and both bounds were stored.
// An hour later they said "consigo pagar 1.1M se aceitarem"; the model returned
// budget_max = 1,100,000 and nothing for the minimum, and the merge -- which
// treats each column on its own -- wrote it. The row then read 1.2M to 1.1M.
// ParseClaude rejects an inverted pair inside ONE reply; nothing checked the
// pair the merge produced. Database matching (Automation 03) reads that pair
// as a band, and a band with min > max matches nothing.
//
// THE RULE
// After the per-column merge, the pair must still be a range. If it is not,
// the bound the lead moved THIS turn is their latest word and the other bound
// follows it: a single figure becomes a point range (min = max), which is an
// honest reading of "I can pay 1.1M" and one a matcher can use. The range it
// replaced is returned so the caller can archive it on the row -- the trail
// stays, the columns stay usable. Both bounds moving into an inverted pair on
// one turn is already caught upstream; here it is sorted, never dropped.
// ============================================================================

// reconcileBudget(stored, merged, moved) -> { min, max, collapsed, reason, replaced }
//
//   stored  { min, max }  the row before this turn
//   merged  { min, max }  after the per-column merge (null = unknown)
//   moved   { min, max }  booleans: which columns the merge changed this turn
function reconcileBudget(stored, merged, moved) {
  const s = stored || {}, m = merged || {}, mv = moved || {};
  const min = (m.min === undefined ? null : m.min);
  const max = (m.max === undefined ? null : m.max);
  const out = { min, max, collapsed: false, reason: null, replaced: null };
  if (min === null || max === null || min <= max) return out;

  out.collapsed = true;
  out.replaced = { budget_min: s.min === undefined ? null : s.min,
                   budget_max: s.max === undefined ? null : s.max };
  if (mv.max && !mv.min) {
    out.min = max; out.reason = 'budget_max=' + max + ' fell below the stored minimum';
  } else if (mv.min && !mv.max) {
    out.max = min; out.reason = 'budget_min=' + min + ' rose above the stored maximum';
  } else {
    out.min = Math.min(min, max); out.max = Math.max(min, max);
    out.reason = 'both bounds moved and arrived inverted';
  }
  return out;
}
