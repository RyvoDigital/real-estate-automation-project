// ============================================================================
// What the row already knows, stated to the model. — shared source.
//
// Embedded verbatim into BuildClaudeRequest. Unit-tested standalone in
// tests/known_facts.test.js, which loads THIS file; exercised against the live
// model by suite 4 of tests/prompt_suites.py.
//
// WHY THIS EXISTS
// On 2026-09-12 a lead who had given a budget, a timeline and an area was asked
// for the budget and the timeline again. The row held all three. The model
// sees the last 20 messages and nothing else; the budget had been stated 80
// messages earlier. Same defect class as every other one this week: the system
// holds a fact in one place and reasons from another.
//
// THE RULE
// A fact the workflow holds is stated to the model on every turn it holds it,
// exactly as the booking status is. The block is built from the ROW, so it can
// only contain what persistence accepted. The lead's newer words override it,
// and the model is told so -- this is a record, not an instruction to repeat.
// The WhatsApp profile name is deliberately NOT a fact: it is a nickname until
// the lead states a name (qualification.name_source = 'stated').
// ============================================================================

function renderKnownFacts(lead, qualification) {
  const l = lead || {}, q = qualification || {};
  const lines = [];
  const clean = (v) => (v === null || v === undefined) ? '' : String(v).trim();
  const eur = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' EUR';

  if (q.name_source === 'stated' && clean(l.full_name)) {
    lines.push('- Name: ' + clean(l.full_name) + ' (write it exactly like this in every reply language; a name is never translated or localised)');
  }
  const TYPE = { buyer: 'buy', seller: 'sell', renter: 'rent' };
  if (TYPE[l.lead_type]) lines.push('- Looking to: ' + TYPE[l.lead_type]);

  const bmin = Number(l.budget_min) > 0 ? Number(l.budget_min) : null;
  const bmax = Number(l.budget_max) > 0 ? Number(l.budget_max) : null;
  if (bmin && bmax) lines.push(bmin === bmax ? '- Budget: about ' + eur(bmin)
                                              : '- Budget: ' + eur(bmin) + ' to ' + eur(bmax));
  else if (bmax) lines.push('- Budget: up to ' + eur(bmax));
  else if (bmin) lines.push('- Budget: from ' + eur(bmin));

  if (clean(l.timeline)) lines.push('- Timeline: ' + clean(l.timeline));
  if (clean(l.area)) lines.push('- Area: ' + clean(l.area));
  if (clean(q.bedrooms)) lines.push('- Bedrooms: ' + clean(q.bedrooms));
  if (clean(q.financing)) lines.push('- Financing: ' + clean(q.financing));
  if (clean(q.purpose)) lines.push('- Purpose: ' + clean(q.purpose));
  if (!lines.length) return '';

  return '\n\nWHAT OUR RECORDS ALREADY HOLD FOR THIS LEAD\n'
    + 'Learned earlier in this conversation, possibly before the messages you can see:\n'
    + lines.join('\n') + '\n'
    + 'Do not ask again for anything listed here, and do not ask the lead to confirm it either - '
    + 'use it. If the lead brings one of these up you may refine it, and what the lead says now '
    + 'overrides the record. In the JSON, '
    + 'return these values unless the lead has changed them; when the lead gives a new figure, '
    + 'return only what they said now.';
}
