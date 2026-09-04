# `src/` — source embedded into n8n nodes

n8n stores node code inside the workflow JSON, which is machine-exported and not
reviewable. These files are the **editable source of record**; the patch scripts
read them and embed a copy into the workflow at build time.

| File | Embedded into | Notes |
|---|---|---|
| `concierge_system_prompt.txt` | `BuildClaudeRequest` (`SYSTEM_TEMPLATE`) | Placeholders `__AGENT__`, `__AGENCY__`, `__AREAS__` are filled from `client_automations.config` |
| `slot_engine.js` | `ProposeSlots` (Checkpoint C) | Unit-tested standalone; see the harness in the C1 notes |

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
