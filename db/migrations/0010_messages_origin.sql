-- ============ messages.origin — who wrote the row ============
--
-- On 2026-09-11 a lead who had asked for a person, been answered by one from
-- the cockpit, and been handed back to the AI was escalated again on "Qual é o
-- próximo passo?". The transcript the model received mapped every outbound row
-- to an assistant turn: the fixed handoff note read as the assistant promising
-- a colleague, the human's reply read as the assistant's own words, and nothing
-- said the request had been handled. Escalating again was the consistent
-- reading of the wrong transcript.
--
-- This column is the durable answer to "who wrote this?". It is set by the
-- writing node at send time and read by BuildClaudeRequest, which labels every
-- turn the assistant did not write. It is a column and not a body match against
-- the configured handoff strings: a client customising their handoff note must
-- not silently turn every note back into the assistant's own words.
--
--   lead     inbound from the lead
--   ai       generated reply, sent by the Concierge
--   human    a person, replying from the cockpit
--   handoff  the fixed handoff note (escalation, or an internal failure)
--   system   any other fixed system message (media, slot taken, ...)

alter table public.messages
  add column if not exists origin text
  check (origin in ('lead', 'ai', 'human', 'handoff', 'system'));

comment on column public.messages.origin is
  'Who wrote the message: lead | ai | human (cockpit reply) | handoff (fixed handoff note) | system (other fixed message). Set by the writer at send time; read by BuildClaudeRequest to label turns the assistant did not write.';

-- One-off backfill of rows that predate the column. The handoff classification
-- below compares bodies to the configured strings; that is acceptable for a
-- ONE-TIME classification of historical rows, verified by the operator, and is
-- NOT the runtime mechanism. Anything outbound that is neither AI nor human nor
-- a known handoff string is 'system', which the transcript labels as "not
-- written by you" -- the fail-safe direction.
update public.messages m
   set origin = case
     when m.direction = 'inbound'   then 'lead'
     when m.ai_generated            then 'ai'
     when m.approved_by_human       then 'human'
     when exists (
       select 1
         from public.client_automations ca,
              jsonb_each_text(
                case when jsonb_typeof(ca.config #> '{system_messages,handoff}') = 'object'
                     then ca.config #> '{system_messages,handoff}'
                     else '{}'::jsonb end) h
        where h.value = m.body)
       or exists (
       select 1 from public.client_automations ca
        where ca.config ->> 'handoff_note' = m.body)
                                    then 'handoff'
     else 'system' end
 where m.origin is null;
