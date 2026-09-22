// ============================================================================
// What each model call in this turn looked like: shared source.
//
// Embedded verbatim into PrepRunAI and PrepRunEscalated. Unit-tested standalone
// in tests/model_calls.test.js, which loads THIS file.
//
// WHY THIS EXISTS (2026-09-22, Defect D): a first attempt came back corrupted
// end to end (gate exec 5780: " only be2509:00 September25:00 09Lisbon time …",
// full_name "Joãoo", purpose ":", "Isbon time") and was delivered. Finding out
// whether that was a pattern meant reading the n8n execution store by hand:
// stop_reason end_turn, 405 output tokens where ~300 is usual, 30 thinking
// tokens, an ordinary request. The run row recorded only the LAST call's token
// counts, and nothing about the first attempt when there was a retry. So every
// run now records each call: why it stopped, how long it was, what was asked,
// and why its reply was rejected, if it was.
//
// modelCallsRecord(get) -> [{ call, stop_reason, output_tokens, thinking_tokens,
//                             text_chars, request, rejected }]
//   get(nodeName) -> that node's first output json, or null when the node did
//                    not run. The node passes a function over $(), so this file
//                    never touches n8n globals and the tests stub it.
// Never throws: a record that cannot be read is null, and the run row is
// written regardless.
// ============================================================================

function mcTextChars(body) {
  let n = 0;
  for (const blk of ((body && body.content) || [])) if (blk && blk.type === 'text') n += String(blk.text || '').length;
  return n;
}

function mcRequest(req) {
  if (!req || typeof req !== 'object') return null;
  let systemChars = 0;
  try { systemChars = typeof req.system === 'string' ? req.system.length : JSON.stringify(req.system || '').length; } catch (e) { systemChars = null; }
  return {
    messages: Array.isArray(req.messages) ? req.messages.length : null,
    system_chars: systemChars,
    max_tokens: req.max_tokens ?? null,
    temperature: req.temperature ?? null,
  };
}

function mcOne(call, response, request, parsed) {
  if (!response) return null;
  const body = (response.body && typeof response.body === 'object') ? response.body : response;
  const u = body.usage || {};
  return {
    call,
    stop_reason: body.stop_reason ?? null,
    output_tokens: u.output_tokens ?? null,
    thinking_tokens: (u.output_tokens_details || {}).thinking_tokens ?? null,
    text_chars: mcTextChars(body),
    request: mcRequest(request),
    rejected: parsed && parsed.ok === false ? String(parsed.errorMessage || parsed.errorType || 'rejected') : null,
  };
}

function modelCallsRecord(get) {
  const safe = (name) => { try { return get(name) || null; } catch (e) { return null; } };
  const out = [];
  try {
    const pc = safe('ParseClaude');
    const first = mcOne('first', safe('CallClaude'), pc && pc.claudeBody, pc);
    if (first) out.push(first);
    const pr = safe('ParseGuardRetry');
    const retry = mcOne('retry', safe('CallClaudeGuardRetry'), pc && pc.retryBody, pr);
    if (retry) out.push(retry);
  } catch (e) {
    return null;
  }
  return out;
}
