# `src/` — source embedded into n8n nodes

n8n stores node code inside the workflow JSON, which is machine-exported and not
reviewable. These files are the **editable source of record**; the patch scripts
read them and embed a copy into the workflow at build time.

| File | Embedded into | Notes |
|---|---|---|
| `concierge_system_prompt.txt` | `BuildClaudeRequest` (`SYSTEM_TEMPLATE`) | Placeholders `__AGENT__`, `__AGENCY__`, `__AREAS__` are filled from `client_automations.config` |
| `slot_engine.js` | `ProposeSlots` (Checkpoint C) | Unit-tested standalone; see the harness in the C1 notes |
| `available_slots_block.example.txt` | appended to the system prompt per request | Illustrative shape only — the workflow generates the real one from free/busy |

**These are inputs to n8n, not the artefact of record.** The committed
`workflows/*.json` must remain byte-identical to `n8n export:workflow` output —
see `docs/concierge-runbook.md`. If you edit a file here, re-patch, re-import,
re-publish, then re-export and commit that.

> ⚠️ Editing a file here changes nothing on its own. It is not live until it has
> been embedded, imported, published and restarted.
