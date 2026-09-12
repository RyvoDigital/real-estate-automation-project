// ============================================================================
// Whose name is on the row? — shared source.
//
// Embedded verbatim into MergeLeadFields. Unit-tested standalone in
// tests/lead_name.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On 2026-09-11 a lead wrote "My name is João Ferreira". The model extracted
// it; the merge refused it with "full_name=Manuel (already set)". The rule was
// "let the model improve the WhatsApp profile name once, then stop churning",
// and it locked the field the moment the row differed from the profile name.
// The profile name is set on FIRST contact and almost always arrives before
// the lead states who they are, so the common case was a real name blocked
// for ever by a nickname.
//
// THE RULE
// A name the lead states in conversation always beats a name taken from the
// profile, whatever the order or length. Between two stated names, a shorter
// form of what is stored ("João" after "João Ferreira") keeps the stored name;
// anything else is the lead restating their name and wins. Where the name
// came from is recorded as qualification.name_source, so the prompt can tell
// a fact from a nickname.
// ============================================================================

function normaliseName(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// mergeName(stored, storedSource, incoming) -> { name, source, changed, kept }
//
//   stored        leads.full_name as it is (null when nothing is known)
//   storedSource  qualification.name_source: 'stated' | anything else = profile
//   incoming      the model's full_name for this turn (null when not seen)
//
//   name     what the row should hold
//   source   'stated' | 'profile'
//   changed  true when the row must be written
//   kept     a note for the run log when the incoming name was refused
function mergeName(stored, storedSource, incoming) {
  const inc = String(incoming == null ? '' : incoming).trim().replace(/\s+/g, ' ');
  const cur = (stored == null || !String(stored).trim()) ? null : String(stored).trim();
  const src = storedSource === 'stated' ? 'stated' : 'profile';

  if (!inc) return { name: cur, source: src, changed: false,
                     kept: cur ? 'full_name=' + cur + ' (incoming was null)' : null };
  if (!cur) return { name: inc, source: 'stated', changed: true, kept: null };

  const a = normaliseName(inc), b = normaliseName(cur);
  if (!a || a === b) return { name: cur, source: src, changed: false, kept: null };
  if (src !== 'stated') return { name: inc, source: 'stated', changed: true, kept: null };

  const at = a.split(' '), bt = b.split(' ');
  const subset = at.every(t => bt.includes(t));
  // The same words in another order are the same name.
  if (subset && at.length === bt.length) return { name: cur, source: 'stated', changed: false, kept: null };
  if (subset) return { name: cur, source: 'stated', changed: false,
                       kept: 'full_name=' + cur + ' (incoming "' + inc + '" is a shorter form)' };
  return { name: inc, source: 'stated', changed: true, kept: null };
}
