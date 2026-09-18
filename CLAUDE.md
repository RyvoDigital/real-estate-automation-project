# Working on this project

## Documentation: reach for context7, not for memory

**When you need library or API documentation, use context7 rather than
reasoning from training data.** First resort, not last.

The Twilio research on 18 September is the argument: idempotency on message
creation, whether an API key can be scoped read-only for Senders, the v1
deprecation, and the April 2025 change that makes a template sent via `Body`
fail outside the 24-hour window — all of it is documentation, and all of it was
reconstructed slowly from search results and memory. Getting any one of them
subtly wrong is a defect in a send path.

**Where it will not help:** anything behind a rendered UI. The Twilio permission
matrix lived in a console screen, not in the docs, and no documentation tool
reaches it. So context7 first, then the live docs, then the console — and say
which one the answer came from.

## Browsers: check the specific thing

Playwright is available. **Every page read and every screenshot costs tokens**,
so go to the exact page and assert the exact thing. Do not explore.

It exists for the checks no token-level probe can make — lesson 15b: a control
that *looks* selected when it is not is invisible to anything reading source or
computed styles, and needs a real render. Note the direction of travel: four
layout defects on 18 September were found by homegrown probes approximating what
a browser would simply report. **The probes are the approximation, not the
answer.**

## Before changing anything

- `docs/engineering-lessons.md` — ways of thinking that outlived the component
  that taught them. §0, §0b, rule 13 and §7 first.
- `docs/WHERE-WE-LEFT-OFF.md` — what is actually deployed.
- `docs/improvements-and-opportunities.md` §0 — the reliability standard, which
  is the standing method rather than a backlog.

## The rules that are not negotiable here

- **No writes to the production database without asking.**
- **Check the artefact, not the execution status.** A green node, a 2xx and a
  zero exit code have each lied on this project.
- **A test that cannot fail proves nothing.** Sabotage a guard and confirm the
  expected test goes red — and assert the sabotage actually applied before
  believing the result (§1f).
- **Every defect becomes a permanent test.**
- The operator holds all secrets.
