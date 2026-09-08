// ============================================================================
// CatchInternal — the convergence point for every Code node that throws.
//
// See docs/code-node-failure-handling-spec.md. The short version: 0 of 32 Code
// nodes had an error branch, LogRun is a leaf reached at the end of every
// branch, so a throw wrote no automation_runs row and the 30-minute failed-run
// health check could not see it. Lead unanswered, operator unalerted, every
// dashboard green.
//
// THIS NODE MUST NOT THROW. It is the handler; nothing catches the catcher. So
// the whole body is one try/catch whose recovery block does nothing but build a
// literal object, and every reference to another node goes through safeNode(),
// because $('X') throws when X has not executed and half the workflow has not.
//
// It is one of two Code nodes with no error branch of its own, both named in
// tests/workflow-error-branches.test.ts with their reasons. The other is
// ThrowDbOutage, which throws deliberately so the execution is recorded as an
// error rather than a quiet success -- catching it would undo D5's fix.
// ============================================================================

// Which zone a node belongs to is decided by WHAT HAS ALREADY HAPPENED TO THE
// LEAD when it throws. That is the only thing that changes the right response.
const ZONES = {
  // 1 - the lead is not yet identifiable. Nobody to answer; email is the record.
  VerifySignature: 1, Normalise: 1, FlattenClient: 1,
  // 2 - lead known, nothing sent. The handoff note is owed and is still possible.
  AfterLead: 2, AfterListing: 2, AfterAgentReply: 2, MediaReply: 2,
  ProposeSlots: 2, MatchConfirmation: 2, BuildClaudeRequest: 2,
  ParseClaude: 2, ParseGuardRetry: 2, DecideEscalation: 2,
  // 3 - the booking path, after the model may already have written a
  //     confirmation. Never book, never let a confirmation stand.
  SkipBooking: 3, ReadRecheck: 3, AfterBooking: 3, BlockedBooking: 3,
  CreatedBooking: 3, ResolveConflict: 3,
  // 4 - the lead already has their reply. Record and continue; NEVER re-send.
  AfterSend: 4, AfterMediaSend: 4, AfterHandoff: 4, AfterNotify: 4,
  AfterEmailAlert: 4, MergeLeadFields: 4, AfterLeadUpdate: 4,
  PrepRunAI: 4, PrepRunDuplicate: 4, PrepRunSilenced: 4, PrepRunMedia: 4,
  PrepRunEscalated: 4,
};

// Hardcoded rather than read from Normalise, because Normalise is one of the
// nodes that can be the thing that threw. It is the same constant Normalise
// carries; if it ever changes, both change.
const SUPABASE_URL = 'https://txxkqskhxhwtrhbmwwig.supabase.co';

function build() {
  // Literal node names, one accessor each. A silent catch is how the first
  // version of this node returned all-nulls and told nobody why, so every
  // failure is recorded in `probe` and travels to the alert.
  //
  // NOTE THE `first(0)`. Without the explicit branch index this returns
  // undefined for every node, and the handler produces an all-null object that
  // looks like "we knew nothing" rather than like a bug. Measured on n8n
  // 2.28.3: an item arriving on an error output carries $prevNode.outputIndex
  // = 1, and that leaks into the DEFAULT branch index for every $() lookup, so
  // $('AfterLead').all() asks for AfterLead's output 1 -- which does not exist
  // -- and returns []. all(0) returns the item. Every accessor in this node
  // therefore names its branch.
  const probe = [];
  const safe = (label, fn) => {
    try {
      const v = fn();
      if (!v) { probe.push(label + '=empty'); return null; }
      return v;
    } catch (e) {
      probe.push(label + '=' + String(e && e.message ? e.message : e).slice(0, 60));
      return null;
    }
  };

  // $prevNode is the node that handed us this item -- on an error branch, the
  // node that threw. This is how the alert names a node instead of saying
  // "something threw", which is not actionable.
  //
  // Measured against n8n 2.28.3 in a throwaway container rather than read off
  // the source: reading workflow-execute.js suggested a thrown node sends its
  // INPUT items down output 0, which would have made every branch here useless
  // and passed junk down the happy path. A real run says otherwise -- the item
  // arrives on output 1 as {error: '<message> [line N]'}, $prevNode.name is the
  // node that threw, and $prevNode.outputIndex is 1. The success branch does
  // not run at all.
  let failedNode = 'unknown', fromErrorOutput = null;
  try { failedNode = $prevNode.name || 'unknown'; } catch (e) { failedNode = 'unknown'; }
  try { fromErrorOutput = $prevNode.outputIndex === 1; } catch (e) { fromErrorOutput = null; }
  const zone = ZONES[failedNode] || 2;   // unknown node: assume the lead is owed a reply

  // n8n puts the thrown message on the item. Take it if it is there -- "a Code
  // node threw" is not an actionable alert and the message usually names the
  // line. Never trust its shape.
  let thrown = null;
  try {
    const it = $input.first().json;
    if (it && typeof it.error === 'string') thrown = it.error.slice(0, 300);
  } catch (e) { thrown = null; }

  // Zone 1's email is the ONLY record there will be, so it has to carry what
  // arrived. Read from the Webhook itself, which is the one node guaranteed to
  // have run -- Normalise, the usual source, is one of the nodes that can be
  // the thing that threw.
  const hook = safe('Webhook', () => $('Webhook').first(0).json);
  const raw = (hook && hook.body) || {};

  const norm = safe('Normalise', () => $('Normalise').first(0).json);
  const flat = safe('FlattenClient', () => $('FlattenClient').first(0).json);
  const lead = safe('AfterLead', () => $('AfterLead').first(0).json);
  const ctx  = lead || flat || norm || {};

  const cfg = (ctx.config) || (flat && flat.config) || {};
  const leadText = ctx.body || (norm && norm.body) || '';

  // The handoff note is a FIXED CONFIG STRING chosen by deterministic language
  // rules -- no model, no calendar, no network. That is the whole reason it can
  // be the answer when something upstream has broken.
  let note = null, lang = null;
  try {
    const picked = systemMessage(cfg, 'handoff', leadText);
    note = picked.text; lang = picked.lang;
  } catch (e) { note = cfg.handoff_note || null; lang = cfg.default_language || null; }

  // Found by the Zone 4 drill, not by design. AfterSend, AfterMediaSend and
  // AfterHandoff each sit BETWEEN a send and its store. If one throws, the
  // message has already gone to the lead and is never written to `messages` --
  // so LoadHistory feeds the model a conversation in which the assistant never
  // spoke, and the next reply is composed as if it had not. That is the D3
  // LoadHistory defect's shape, reached a different way.
  //
  // DECIDED, 2026-09-08: the handler does NOT write the message row, and this
  // is not an oversight waiting to be improved.
  //
  // `messages` already has one writer per path; a second one racing it can
  // duplicate a turn. The tiebreaker is where each failure lands:
  //
  //   a DUPLICATED turn  -> the lead is sent something twice. It reaches the
  //                         prospect, and nobody can take it back.
  //   a MISSING turn     -> the model composes as if it had not spoken, and
  //                         the alert below reproduces the text, so a human
  //                         can see exactly what the lead was told and act.
  //
  // Prefer the failure that lands where someone can act on it. The alert
  // reproduces the reply for the same reason EmailDbOutage reproduces the
  // inbound message: it exists nowhere else.
  const POST_SEND = { AfterSend: 'SendWhatsApp', AfterMediaSend: 'SendMediaReply',
                      AfterHandoff: 'SendHandoffNote' };
  let unrecordedReply = null;
  if (POST_SEND[failedNode]) {
    const r = failedNode === 'AfterSend'
      ? safe('SendWhatsApp', () => $('SendWhatsApp').first(0).json)
      : failedNode === 'AfterMediaSend'
        ? safe('SendMediaReply', () => $('SendMediaReply').first(0).json)
        : safe('SendHandoffNote', () => $('SendHandoffNote').first(0).json);
    const b = (r && r.body) || {};
    unrecordedReply = {
      sid: b.sid || null,
      status: r ? r.statusCode : null,
      text: b.body || null,
    };
  }

  // Zone 3 only: an event may already exist for this slot, created before the
  // throw. The operator has to be told to look, because nothing else will.
  let slotWarning = null;
  if (zone === 3) {
    const mc = safe('MatchConfirmation', () => $('MatchConfirmation').first(0).json) || {};
    const s = mc.bookingSlot || null;
    if (s) {
      slotWarning = 'A calendar event MAY have been created for '
        + (s.startLocal || s.startUtc) + ' (id ' + (mc.bookingEventId || 'unknown')
        + '). Check the calendar before replying to this lead.';
    }
  }

  const phone = ctx.from || (norm && norm.from) || null;
  // canReply stays false for zone 1 even though `raw.From` gives us a number:
  // without a resolved client there is no configured handoff note to send, and
  // a message we invent is exactly what this project does not do.
  const canReply = (zone === 2 || zone === 3) && !!phone && !!note;

  return {
    internalFailure: true,
    failedNode, zone,
    errorType: 'internal_error:' + failedNode,
    errorMessage: thrown || 'a Code node threw; the message did not reach the handler',
    fromErrorOutput,
    // Everything the downstream nodes need, flattened, so none of them has to
    // reach back into a node that may not have run.
    supabaseUrl: SUPABASE_URL,
    clientAutomationId: ctx.clientAutomationId || (flat && flat.clientAutomationId) || null,
    clientId: ctx.clientId || (flat && flat.clientId) || null,
    leadId: ctx.leadId || null,
    from: phone || String(raw.From || '').replace(/^whatsapp:/, '') || null,
    profileName: ctx.profileName || (norm && norm.profileName) || raw.ProfileName || null,
    messageSid: ctx.messageSid || (norm && norm.messageSid) || raw.MessageSid || null,
    body: leadText || raw.Body || '',
    handoffBody: note,
    handoffLang: lang,
    canReply,
    slotWarning,
    priorQualification: ctx.priorQualification || null,
    probe: probe.join(' ; ') || 'all context nodes read cleanly',
    unrecordedReply,
    startedAt: ctx.startedAt || new Date().toISOString(),
    at: new Date().toISOString(),
  };
}

let out;
try {
  out = build();
} catch (e) {
  // The recovery block constructs a literal and nothing else. If this is ever
  // reached, the email downstream is the only record there will be, so it
  // carries the reason this node could not do its job.
  out = {
    internalFailure: true, failedNode: 'unknown', zone: 1,
    errorType: 'internal_error:CatchInternal',
    errorMessage: 'the failure handler itself failed: ' + (e && e.message ? e.message : 'unknown'),
    supabaseUrl: SUPABASE_URL,
    clientAutomationId: null, clientId: null, leadId: null,
    from: null, profileName: null, messageSid: null, body: '',
    handoffBody: null, handoffLang: null, canReply: false, slotWarning: null,
    priorQualification: null,
    startedAt: new Date().toISOString(), at: new Date().toISOString(),
  };
}
return [{ json: out }];
