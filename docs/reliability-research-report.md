# How reliable AI products are actually built — research report

**Compiled 14 Sep 2026.** Sources: arXiv reliability papers, tau-bench / ReliabilityBench, Confident AI, Braintrust, ClickHouse, OWASP LLM Top 10, and practitioner rollout playbooks. All 2026 material.

**Purpose:** answer a direct question — *what is the plan for catching defects nobody thought of, and how do the best teams make a product that rarely fails in front of a client?*

---

# 1. The headline: nobody tests their way there, and everyone knows it

The single most consistent finding across every serious source is that **offline testing does not predict production behaviour.**

- Research puts the gap between benchmark scores and real-world deployment at around **37%**. Benchmarks use clean inputs and controlled environments; production has ambiguous requests, flaky APIs, unexpected formats and adversarial users.
- Practitioner reports put **evaluation at 60–80% of development time** in successful AI product teams — and **most of that time is spent understanding failures, not writing automated checks.**
- The canonical cautionary tale in the 2026 literature: a refund agent that spent three months in staging with perfect scores, then issued $4,200 in unauthorised refunds in its first hour of production. The cause was a customer saying *"I want a refund for that thing I bought but can't remember the name of"* — a sentence staging never produced. **"You can't test for reality. You can only expose your agent to it carefully."**

**What this means for the anxiety:** the feeling that defects keep appearing is not evidence of a badly-built system. It is the normal, documented condition of this entire category. The teams that ship reliably are not the ones with no unknown defects — they are the ones with a method for catching them fast and never repeating them.

---

# 2. The five practices that actually work

## 2.1 Verify the end state, not the last message 🔴 the most important one

**The pattern across every serious benchmark is execution-based verification.** tau-bench checks the *database state* after the agent runs. SWE-Bench runs the test suite. The explicit warning in the literature:

> A benchmark that only checks tool-call syntax or final text would pass agents that look right and do the wrong thing.

**This is precisely the Ryvo failure mode.** Every defect found on 11–14 September was a reply that looked right while the row held something else:

| Date | The reply said | The system held |
|---|---|---|
| 11 Sep | booking confirmed | no calendar event |
| 11 Sep | (silence) | escalation flag from three days earlier |
| 12 Sep | "€1,100,000 recorded" | €1.2M–€1.5M, write rejected |
| 12 Sep | "Hi John" | name is João |
| 13 Sep | (booked a slot silently) | lead never told |
| 14 Sep | "I'll get that meeting set" | no offer stored, nothing being arranged |

Six defects, one shape. The industry has a name for the fix: **assert on state, not on text.**

## 2.2 pass^k, not pass@k — consistency over single success

Standard benchmarks measure whether an agent succeeded once. Production reliability requires **all-runs consistency** — the `pass^k` metric from tau2-bench, which measures whether the agent succeeds reliably across repeated attempts rather than on a lucky draw.

**Ryvo hit this directly on 12 September:** a prompt variant scored 24/24, then 22/22 on the identical test. The first number was a good draw, not a fix. The discipline that follows — *run it twice before believing it, and report nothing as fixed until the full suite has run on the deployed artifact* — is already in `docs/testing-strategy.md`. It is also exactly what the literature prescribes.

**ReliabilityBench** formalises this across three dimensions: consistency under repeated execution, robustness to task perturbations, and fault tolerance under infrastructure failures — explicitly inspired by chaos engineering. Reliability is framed as it is in aerospace: *the probability that a system performs its required function under stated conditions for a specified period*, with MTBF and failure-rate curves.

## 2.3 Trace-based evaluation — how the unplanned gets caught 🔴 the answer to the question

This is the direct answer to *"what's the plan for catching things nobody thought of?"*

**Single test cases are not enough for autonomous agents.** The prescribed approach is trace-based evaluation, production sampling, and **regression datasets that grow as new failure modes appear.**

Tracing is described as the backbone because it does three things:
1. Shows where a metric failed
2. **Surfaces new failure modes you don't have metrics for yet**
3. Paired with periodic human review, keeps evaluation calibrated as the agent drifts

Evaluate at three levels: **end-to-end** (did the task succeed), **trajectory-level** (was the path sound), and **component-level** (which tool or sub-agent broke).

**The key insight:** you don't catch unknown failures by predicting them. You catch them by recording everything the agent did, sampling it regularly with human eyes, and turning each discovery into a permanent test. The unknown third shrinks through exposure, not planning.

## 2.4 Guardrails — enforcement code the model cannot argue with

The 2026 consensus defines guardrails as **programmatic controls outside the model that cannot be talked out of their job.** Not prompt instructions — code.

A layered architecture:
- **Input validation** — reject or sanitise before the model sees it (5–50ms budget)
- **Output filtering** — schema validation, hallucination checks, format enforcement, with **re-ask loops when validation fails**
- **Execution rails** — validate tool calls, arguments and returned results *before* a consequential action fires
- **Runtime observability** — record every guardrail verdict alongside the LLM telemetry

The critical distinction: **a guardrail handles a live interaction; an eval measures whether the guardrail is applying the policy correctly.** One does not substitute for the other. A guardrail decision tells you nothing about its own miss rate.

For tool-using agents specifically, the research is explicit that checks must cover **execution state, tool arguments and downstream effects — not only input–output text**, and that **pre-execution verification is critical for high-impact tools.**

**Ryvo is unusually strong here already.** The invented-time guard, the booking-claim guard, the name guard, the language guard and the *booking-is-stated-or-not-made* rule are all execution rails with re-ask loops, built in the right place for the right reasons. This is the part of the industry playbook already implemented.

## 2.5 Staged rollout — shadow, then canary, then full

The universal deployment pattern, and the part Ryvo has not yet planned.

**Shadow mode.** The agent processes real traffic but its outputs go to logs, not customers. Humans remain the decision-makers. Recommended duration ranges from 48 hours minimum to 2–4 weeks, sampling 50–100 outputs a week and comparing against what the human actually did. One documented case: an agent was "correct" 96% of the time, and **the entire 4% divergence sat in edge cases that violated compliance policy.** Shadow mode caught it before any real impact.

**Canary.** 1–5% of real traffic, with explicit guardrails — max actions per session, action allowlists, mandatory approval above a risk threshold. Stage up 5 → 15 → 30 → 60 → 100 with a real pause and a go/no-go against pre-defined numbers at each step.

**The warning that matters most:**

> The riskiest canary failures aren't crashes. They're an agent that responds fluently but is subtly wrong, over-promising, or slightly off-brand in tone. Human review of a sample of canary conversations at each stage — not just automated metrics — catches this class of problem that dashboards alone miss.

That is a precise description of *"I'll get that first meeting set, they'll be in touch to confirm."* Fluent, on-brand, over-promising, and invisible to every dashboard.

---

# 3. Where Ryvo is already doing this right

Worth stating plainly, because four days of bug-hunting distorts the picture.

| Industry practice | Ryvo status |
|---|---|
| Execution rails on consequential actions | ✅ Booking withheld unless the reply states it. Correctly prevented a wrong booking on 14 Sep |
| Re-ask loops on failed validation | ✅ Targeted retry with the fault named, then deliver-with-warning. No escalation for form errors |
| Deterministic checks over model judgement | ✅ Language, name, invented-time and booking-claim guards are all code, not prompt instructions |
| Safe degradation | ✅ Refuses to invent listings, escalates on price, hands to a human when unsure |
| Human-in-the-loop for high-stakes actions | ✅ The escalation queue with a breach clock is exactly the prescribed shape |
| Report nothing fixed until the full suite runs on the deployed artifact | ✅ Adopted 12 Sep after being burned by it |
| Structured run payloads recording guard verdicts | ✅ Every run records match status, retries, mismatches |

**The guardrail layer is genuinely ahead of where a solo build normally is.**

---

# 4. Where Ryvo is genuinely behind

| Gap | Consequence |
|---|---|
| **No state-assertion tests** | Every defect this week was reply-vs-row disagreement. Nothing checks that invariant automatically |
| **No integration tests over whole conversations** | Component tests pass while the seams fail. Three deploys reported clean and were wrong |
| **No regression test per closed defect** | 1.1 was fixed, verified, and returned within an hour |
| **No alerting of any kind** | The one that matters most. A failure is currently found by Manuel, at night, by chance |
| **No trace review habit** | Tonight's bug is invisible in metrics and obvious in the transcript |
| **No staged rollout plan** | Vania would go from zero to full production in one step |
| **Areas hardcoded in config** | Not reliability, but a manual step that will eventually be got wrong |

---

# 5. The tooling landscape — and what is worth adopting

**Evaluation platforms:** LangSmith, Braintrust, Phoenix, DeepEval, Ragas, OpenAI Evals. DeepEval is fully open source and supports trace- and span-level metrics directly.

**Guardrail libraries:** Guardrails AI (composable validators with re-ask loops, Pydantic schema validation), NVIDIA NeMo Guardrails (input, output, dialog, retrieval and execution rails), Lakera Guard (runtime screening), Llama Guard, Microsoft Presidio (PII).

**Benchmarks worth understanding rather than running:** tau-bench and tau2-bench (state verification, `pass^k`), ReliabilityBench (consistency, robustness, fault tolerance).

**Honest assessment for Ryvo:** almost none of this should be adopted now.

- The guardrail libraries solve problems Ryvo has already solved by hand, in n8n, and would mean a rewrite.
- The eval platforms are priced and shaped for teams with volume. Ryvo has one prospect.
- **LLM-as-judge**, the default scorer in all of them, has documented failure modes — length and verbosity bias being the main one — and needs calibration against a human gold set, with a Cohen's kappa floor around 0.41–0.60 before it can be trusted to gate anything, plus monthly recalibration.

**Take the methods, not the platforms.** Revisit tooling at five clients.

---

# 6. The plan for Ryvo

Ordered by value per hour, grounded in the above.

## Tier 1 — before Vania goes live

**1. State invariants, checked on every run.** The single highest-value item, and the direct answer to catching the unplanned. Enumerate what must always be true, then anything that violates one surfaces — including things nobody predicted:

- If a reply names a time, the workflow holds an offer containing it *(catches tonight's bug)*
- If a reply confirms a booking, a calendar event exists *(catches the phantom booking)*
- If a booking is on the row, a calendar event exists *(catches the retired-booking case)*
- If a lead sent a message, an outbound message exists or a deliberate-silence flag is set *(catches the 992ms silent success)*
- If a reply states a fact about the lead, that fact is on the row *(catches the budget confirmation)*

**Every defect of the past four days violates one of these five.** One family of checks, the whole family of bugs — including the members not yet met.

**2. Alerting, three layers** (see §3.7 of the improvements doc). Free, an afternoon, and it converts *"will something go wrong"* — unanswerable and frightening — into *"will I know"* — answerable and cheap.

**3. Transcript review as a daily habit.** Twenty minutes a day for the first month with a live client. Read the words, not the dashboard. This is the industry's prescribed answer to fluent-but-wrong, and it is the only thing that catches it.

## Tier 2 — before client two

**4. Integration tests over whole conversations**, asserting both the reply and the resulting database state. Grow the set from real failures rather than imagined ones.

**5. A regression test for every closed defect.** Cheapest discipline available; would have caught the one regression that occurred.

**6. Adversarial conversation testing as a release gate.** Twenty unscripted conversations from at least two people who did not build it — one told to behave normally, one told to break it. Half a day per automation, and it is what found both unplanned defects this weekend.

## Tier 3 — the rollout shape for Vania

**7. Staged, not switched on.**
- **Days 1–3, shadow:** the Concierge answers, Manuel reads every conversation before the day ends. Nothing goes out unreviewed.
- **Week 1, constrained:** live, but escalation thresholds set low so more reaches a human than strictly necessary.
- **Weeks 2–4, ramp:** loosen as the transcripts justify it.
- **Reactivation in batches of 20–30 a day**, never a blast — which is already the plan, for WhatsApp number-safety reasons, and happens to be the correct reliability posture too.

---

# 7. What this actually buys

Not zero failures. The literature is unanimous that zero is not available.

**It buys failures that are small, visible within minutes, and never repeated.**

A client tolerates *"something odd happened, Manuel called me twenty minutes later and it was fixed."* A client does not tolerate *"it has been telling my buyers the wrong thing for three weeks and nobody noticed."*

The distance between those two is not test coverage. It is **invariants, alerting, and someone reading the transcripts** — and all three are cheap, none of them requires a platform, and none of them is built yet.

---

# 8. Sources

- Confident AI — *LLM Agent Evaluation Metrics in 2026* (trace-based eval, three evaluation levels)
- morphllm.com — *AI Agent Evaluation 2026* (execution-based verification, LLM-judge failure modes)
- digitalapplied.com — *Building an AI Agent Evaluation Pipeline: 2026 Methodology* (pass^k, judge calibration, CI gating)
- jobsbyculture.com — *AI Agent Evaluation Guide 2026* (37% benchmark–production gap, six core metrics)
- arXiv 2601.06112 — *ReliabilityBench* (consistency, robustness, fault tolerance)
- arXiv 2603.29231 — *Beyond pass@1: A Reliability Science Framework for Long-Horizon LLM Agents*
- arXiv 2606.04990 — *From Agent Traces to Trust* (pre/post-execution verification)
- ClickHouse Engineering — *LLM guardrails in production* (five control types, OWASP alignment)
- Braintrust — *Best LLM guardrails and security testing tools (2026)*
- bigdataboutique.com — *AI Guardrails: layered defence architecture*
- agentmelt.com — *From Pilot to Production* (shadow → canary playbook)
- accelate.ai — *Canary Testing an AI Agent* (stage percentages, fluent-but-wrong warning)
- sivaro.in — *AI Agent Production vs Staging* (the refund agent case)
- brightlume.ai — *Shadow Mode Rollouts for AI Agents*
