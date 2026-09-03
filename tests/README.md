# tests

| File | What it covers | How to run |
|---|---|---|
| `slot_engine.test.js` | `src/slot_engine.js` — timezones, DST, working hours, `min_hours_notice`, busy overlaps, `preferDate` guards, free/busy response validation | Copy into the n8n container and run with `NODE_PATH` pointed at n8n's `node_modules` (Luxon must be the same one the Code node uses) |
| `prompt_suites.py` | `src/concierge_system_prompt.txt` — inventory assertion, language matching **including booking-with-slots**, never-invent-a-time | On the server: `python3 tests/prompt_suites.py` (reads `.env`) |

**Run `prompt_suites.py` after any prompt change.** A prompt edit has now had an
effect outside the section being edited three times — Portuguese examples
changing reply language at B1, and an English slot list doing the same at C1.

The language suite deliberately includes the **booking-with-slots** combination.
It was added because two suites both passed while the gap between them did not
belong to either: the never-invent suite graded times and ignored language, the
language suite had no case carrying a slot list. See `engineering-lessons.md`.
