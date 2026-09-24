# `src/` — source embedded into n8n nodes

n8n stores node code inside the workflow JSON, which is machine-exported and not
reviewable. These files are the **editable source of record**; the patch scripts
read them and embed a copy into the workflow at build time.

| File | Embedded into | Notes |
|---|---|---|
| `concierge_system_prompt.txt` | `BuildClaudeRequest` (`SYSTEM_TEMPLATE`) | Placeholders `__AGENT__`, `__AGENCY__`, `__AREAS__` are filled from `client_automations.config` |
| `slot_engine.js` | `ProposeSlots`, `MatchConfirmation` (Checkpoint C) | Slot engine and the confirmation matcher; a question is not an acceptance, an ordinal naming the appointment ("first meeting") is not a slot choice; `tests/slot_engine.test.js` and `tests/match_confirmation.test.js` load this file |
| `appointment_kind.js` | `BuildClaudeRequest`, `ParseClaude`, `ParseGuardRetry` | Meeting vs viewing; `tests/appointment_kind.test.js` loads this file |
| `booking_check.js` | `ResolveBooking` | Is the stored booking still real: past / cancelled / missing / confirmed / unreadable; `tests/booking_check.test.js` loads this file |
| `booking_claim.js` | `ParseClaude`, `ParseGuardRetry` | Second line of defence: rejects a reply asserting an appointment the workflow does not hold, in the past tense ("já tem uma reunião marcada") and since 14 Sep the future tense ("I'll get that set", "vou marcar"); `tests/booking_claim.test.js` loads this file |
| `event_id.js` | `ReadSlotEvents` | Generation suffix for the slot-keyed event id, so a deleted event does not burn the slot; `tests/event_id.test.js` loads this file |
| `budget_range.js` | `MergeLeadFields` | A budget is one fact with two bounds: after the per-column merge the pair must still be a range, or the bound the lead moved this turn pulls the other with it and the old range is archived; `tests/budget_range.test.js` loads this file |
| `offer_count.js` | `BuildClaudeRequest` | How many of the assistant's own turns ended with an unanswered offer to propose times since the lead last raised booking; stated as an OFFERS note; `tests/offer_count.test.js` loads this file |
| `booking_stated.js` | `ParseClaude`, `ParseGuardRetry` | A booking made this turn must be stated in the reply (time and day); one targeted retry, then the booking is withheld with a warning event. Also `slotsNamedIn()`: which offered slots the reply named, so the merge stores the offer the lead was shown; `tests/booking_stated.test.js` loads this file |
| `reply_name.js` | `ParseClaude`, `ParseGuardRetry` | Did the reply address the lead by a name not on the row (narrow: direct-address position only); one targeted retry, then delivered with a warning event; `tests/reply_name.test.js` loads this file |
| `reply_language.js` | `BuildClaudeRequest`, `ParseClaude`, `ParseGuardRetry` (after `language.js`) | States the detected reply language in the prompt; checks the reply came back in it (name masked, per-language bar); one targeted retry carrying the reason, then delivered with a warning event, never escalated; `tests/reply_language.test.js` loads this file |
| `known_facts.js` | `BuildClaudeRequest` | States what the row already holds (name when stated, type, budget, timeline, area, bedrooms, financing, purpose) so the model does not re-ask what a 20-message window cannot see; `tests/known_facts.test.js` loads this file, `prompt_suites.py` suite 4 renders it |
| `lead_name.js` | `MergeLeadFields` | A stated name beats the WhatsApp profile name whatever the order or length; between stated names a shorter form keeps the stored one; records `qualification.name_source`; `tests/lead_name.test.js` loads this file |
| `lead_stage.js` | `MergeLeadFields` | Stage follows what the workflow holds: a retired booking regresses `viewing_booked` to `qualified`, `not_interested` derives `lost`, forward moves on the model's proposal only; `tests/lead_stage.test.js` loads this file |
| `transcript.js` | `BuildClaudeRequest` | Who wrote what — origin labels and the hand-back note; `tests/transcript.test.js` loads this file |
| `ai_disclosure.js` | `AfterBooking`, `MediaReply`, `CatchInternal`, `BuildClaudeRequest`, `AssertDelivery`, `PrepRunAI`, `PrepRunEscalated`, `PrepRunMedia` | **EU AI Act Article 50.** Who decides a disclosure is due (`shouldDisclose`), what it says in pt/en/es (`disclosureText`), how it is prepended within Twilio's 1600-character limit (`withDisclosure`), and whether a given text discloses at all (`disclosureIn`, which invariant 6 reads the wire with). The predicate is *has a disclosure been delivered to this lead*, never *is this a new lead*. Config may replace the wording per language but cannot switch it off. `tests/ai_disclosure.test.js` loads this file |
| `catch_internal.js` | `CatchInternal` (after `language.js` and `ai_disclosure.js`) | The failure handler: what broke, which zone, and the fixed handoff note to send when the model never got a chance. Since 16 Sep it also prepends the AI disclosure, unconditionally when the disclosure state could not be read — this path runs *because something threw*, and its note reads as though a human wrote it |
| `opt_out.js` | *not yet embedded — Stage 1, piece 1* | **Opt-out recognition, in three tiers, because suppression is two actions and only one is reversible.** `halt` stops sending and is undone by a human in a second; `record` writes `kind='objection'` to the ledger, which rule 1 of the derivation never lets a later consent overturn and which `consent_events` refuses to UPDATE or DELETE. So `opt_out` halts and records, `unclear` halts and records NOTHING (a human reads it), `not_opt_out` does neither. A keyword counts only as the whole message, and a negation of wanting counts only when what is not wanted is contact — otherwise "não quero perder esta oportunidade" becomes a permanent objection. `tests/opt_out.test.js` loads this file |
| `operator_card.js` | `BuildOperatorAlert`, `BuildOperatorAlertMedia`, `BuildOperatorAlertInternal` (after `language.js`, between `// >>> EMBED` markers) | **The handoff card** sent to the operator on every escalation, on all three paths (24 Sep 2026): *Passagem para uma pessoa*, then Contacto, Idioma, Procura, Orçamento, Prazo, Motivo, Já dito, in Portuguese. Every field from what the run recorded, "não indicado" when it has nothing; Motivo a Portuguese sentence for every reason code (and for `escalation_kind`); Já dito from the disclosure rows, the booking on the row and the note actually delivered, never model text. Times through the tz database in the client's zone (Lisbon changes offset on 25 Oct). `operatorAlert()` never throws: on any throw or failed validation it returns the old three-line alert byte for byte. `alertRecipients()` is the one place a recipient is chosen, for the per-consultant routing of 3–10 Oct. `tests/operator_card.test.js` loads this file; `tests/operator_card_nodes.test.js` runs the three nodes and the Notify expressions |
| `invariants.js` | `AssertInvariants`, `AssertDelivery` (after `booking_claim.js`, `booking_stated.js`, `reply_name.js`, whose detectors it reuses, and `ai_disclosure.js`, whose `disclosureIn()` invariant 6 calls) | The **six** invariants of improvements §0.2: a time named is in an offer the row holds (1), a booking confirmed has an event (2), a booking on the row has an event (3) and an event created is on the row (3b), a lead was answered or the silence is flagged (4), a stated name or money amount is on the row (5), a first interaction carried the AI disclosure (6). Observes only, on the text actually sent and the row as returned; a violation is an `invariant.violated` event, a WhatsApp and `payload.invariants`; `tests/invariants.test.js` loads this file, `tests/ai_disclosure.test.js` covers 6 |

**There is deliberately no example of the `AVAILABLE_SLOTS` block here.** There
was one, `available_slots_block.example.txt`, and it drifted: by 2026-09-04 it
had fallen a sentence behind the shipping node, so `tests/prompt_suites.py` was
measuring a weaker prompt than production sent and attributing the resulting
failures to the live system. The suite now renders the block out of the
shipping node via `tests/render_slots_block.py`, and raises rather than falling
back if it cannot. Do not reintroduce a copy.

**These are inputs to n8n, not the artefact of record.** The committed
`workflows/*.json` must remain byte-identical to `n8n export:workflow` output —
see `docs/concierge-runbook.md`. If you edit a file here, re-patch, re-import,
re-publish, then re-export and commit that.

> ⚠️ Editing a file here changes nothing on its own. It is not live until it has
> been embedded, imported, published and restarted.
