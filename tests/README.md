# tests

| File | What it covers | How to run |
|---|---|---|
| `slot_engine.test.js` | `src/slot_engine.js` — timezones, DST, working hours, `min_hours_notice`, busy overlaps, `preferDate` guards, free/busy response validation | Copy into the n8n container and run with `NODE_PATH` pointed at n8n's `node_modules` (Luxon must be the same one the Code node uses) |
| `prompt_suites.py` | `src/concierge_system_prompt.txt` — inventory assertion, language matching **including booking-with-slots**, never-invent-a-time | On the server: `python3 tests/prompt_suites.py` (reads `.env`). `N_WITH_SLOTS=8` raises the sample on the booking-with-slots language cases |
| `render_slots_block.py` | Not a test — renders the `AVAILABLE_SLOTS` block **out of the shipping node** for the two suites above | Imported by `prompt_suites.py`; run directly to eyeball the block |

**Run `prompt_suites.py` after any prompt change.** A prompt edit has now had an
effect outside the section being edited three times — Portuguese examples
changing reply language at B1, and an English slot list doing the same at C1.

The language suite deliberately includes the **booking-with-slots** combination.
It was added because two suites both passed while the gap between them did not
belong to either: the never-invent suite graded times and ignored language, the
language suite had no case carrying a slot list. See `engineering-lessons.md`.

**Neither suite may hold its own copy of a prompt fragment.** `prompt_suites.py`
used to read the slot block from `src/available_slots_block.example.txt`. The
copy drifted one sentence behind the node — the missing sentence being the very
instruction that stops the language leak — so the suite reported a failure that
belonged to the copy, not to the product. It now renders the block from the
workflow via `render_slots_block.py`, which **raises** rather than falling back
if it cannot reach the shipping artefact. That fallback is the defect, not the
safety net. See `engineering-lessons.md` §1, instance 9.

`render_slots_block.py` shells out to `node` **inside the n8n container**,
because the block is built by JavaScript in `BuildClaudeRequest` and the host
has no node. Python only slices the fragment between two fixed markers; node
does all the semantics.
