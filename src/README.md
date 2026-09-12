# `src/` — source embedded into n8n nodes

n8n stores node code inside the workflow JSON, which is machine-exported and not
reviewable. These files are the **editable source of record**; the patch scripts
read them and embed a copy into the workflow at build time.

| File | Embedded into | Notes |
|---|---|---|
| `concierge_system_prompt.txt` | `BuildClaudeRequest` (`SYSTEM_TEMPLATE`) | Placeholders `__AGENT__`, `__AGENCY__`, `__AREAS__` are filled from `client_automations.config` |
| `slot_engine.js` | `ProposeSlots` (Checkpoint C) | Unit-tested standalone; see the harness in the C1 notes |
| `appointment_kind.js` | `BuildClaudeRequest`, `ParseClaude`, `ParseGuardRetry` | Meeting vs viewing; `tests/appointment_kind.test.js` loads this file |
| `booking_check.js` | `ResolveBooking` | Is the stored booking still real: past / cancelled / missing / confirmed / unreadable; `tests/booking_check.test.js` loads this file |
| `booking_claim.js` | `ParseClaude`, `ParseGuardRetry` | Second line of defence: rejects a reply asserting an appointment the workflow does not hold; `tests/booking_claim.test.js` loads this file |
| `event_id.js` | `ReadSlotEvents` | Generation suffix for the slot-keyed event id, so a deleted event does not burn the slot; `tests/event_id.test.js` loads this file |
| `budget_range.js` | `MergeLeadFields` | A budget is one fact with two bounds: after the per-column merge the pair must still be a range, or the bound the lead moved this turn pulls the other with it and the old range is archived; `tests/budget_range.test.js` loads this file |
| `offer_count.js` | `BuildClaudeRequest` | How many of the assistant's own turns ended with an unanswered offer to propose times since the lead last raised booking; stated as an OFFERS note; `tests/offer_count.test.js` loads this file |
| `known_facts.js` | `BuildClaudeRequest` | States what the row already holds (name when stated, type, budget, timeline, area, bedrooms, financing, purpose) so the model does not re-ask what a 20-message window cannot see; `tests/known_facts.test.js` loads this file, `prompt_suites.py` suite 4 renders it |
| `lead_name.js` | `MergeLeadFields` | A stated name beats the WhatsApp profile name whatever the order or length; between stated names a shorter form keeps the stored one; records `qualification.name_source`; `tests/lead_name.test.js` loads this file |
| `lead_stage.js` | `MergeLeadFields` | Stage follows what the workflow holds: a retired booking regresses `viewing_booked` to `qualified`, `not_interested` derives `lost`, forward moves on the model's proposal only; `tests/lead_stage.test.js` loads this file |
| `transcript.js` | `BuildClaudeRequest` | Who wrote what — origin labels and the hand-back note; `tests/transcript.test.js` loads this file |

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
