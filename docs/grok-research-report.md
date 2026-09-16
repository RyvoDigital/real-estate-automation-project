# Grok Bot and the xAI platform — research report

**Compiled 12 Sep 2026.** For §5 (Opportunities) of `improvements-and-opportunities.md`.
**Verdict up front: do not build on it. Two things are worth stealing. One is worth watching.**

---

# 1. What it actually is

Two different products get called "Grok" and conflating them is the main source of confusion online.

**Grok** is the chatbot and the model family. You ask, it answers. Competes with Claude and ChatGPT.

**Grok Bot** is the thing the internet is excited about. Launched in beta on **11 August 2026**. It is not a chatbot — it is a set of persistent agents, each with **its own cloud computer**, that sign into your real tools with your real credentials and work multi-step jobs continuously, coming back only when they need approval. Work continues after you close your laptop, because it never ran on your laptop.

The design choice that separates it from n8n, Zapier and every workflow builder: **there is no workflow to build.** You message a Bot in plain language and it operates apps the way a person would — including platforms with no API and no MCP integration. It drives a browser.

**The "chief of staff" model.** You can run several Bots at once and appoint one to manage the others. They message each other directly and coordinate in group chats. The pitch is a small team you supervise rather than one assistant you micromanage.

## Why it exists now

In June 2026 SpaceX acquired **Cursor** for a reported $60bn, and Cursor, xAI and SpaceX now present as **SpaceXAI**. Grok Bot is the first joint product and runs on Cursor's infrastructure.

The commercial pressure is visible in the filings: **SpaceX's S-1 showed the AI unit losing $2.47bn in Q1 2026 on $818m of revenue.** Grok Bot is an enterprise play to close that gap. Useful context — it tells you the pricing is set to capture enterprise budget, not to be cheap for a solo founder.

---

# 2. The model lineup (the API side)

Worth knowing separately, because the API is a different product from the subscriptions.

| Model | Released | Context | Input / Output per M tokens |
|---|---|---|---|
| **Grok 4.6** | 12 Aug 2026 | 500K | $2.00 / $6.00 ($0.50 cached) |
| Grok 4.5 | Jul 2026 | 500K | $2.00 / $6.00 ($0.30 cached) |
| Grok 4.3 | Apr 2026 | **1M** | $1.25 / $2.50 |
| Grok 4.20 | Mar 2026 | **2M** | $1.25 / $2.50 |
| **Grok 4.1 Fast** | — | **2M** | **$0.20 / $0.50** |
| Grok Build 0.1 | May 2026 | — | $1.00 / $2.00 (coding) |

**Prices roughly double above a 200K-token prompt.** Server-side tool calls bill separately.

Counter-intuitively, the newest flagships have the *smallest* context windows. Grok 4.3 is the better pick for long documents, native video input (up to 5 minutes) and generating PDF/XLSX/PPTX.

**Also shipped in 2026:** Skills (persistent reusable expertise, May 2026), a terminal coding agent (Grok Build), Grok Imagine Image 2.0, and third-party connectors including Vercel, Canva, Gamma and S&P Global.

---

# 3. What it costs

| Tier | Price | What matters |
|---|---|---|
| Free | $0 | Evaluation only. **Conversations may be used for training.** |
| SuperGrok Lite | $10/mo | Imagine access |
| SuperGrok | $30/mo | The sensible tier for most people |
| **SuperGrok Heavy** | **$300/mo** (reported $99 promo for 3 months) | **The only consumer tier with Grok Bot beta access** |

Grok Bot is also bundled with Cursor Ultra and Cursor Teams Premium.

**There is no per-Bot or per-task price published.** Parallel Bots and scheduled routines consume the subscription's usage allocation with no clear unit cost, so the only honest way to evaluate it is cost per completed workflow — which you cannot know until you have run it.

**Only Business and Enterprise plans guarantee your data is not used for training.**

---

# 4. What is genuinely relevant to Ryvo

Ranked by real value, not by excitement.

## 4.1 🟢 The idea worth stealing: the overnight outbound Bot

xAI's own published example is a **sales outbound Bot that researches accounts overnight, scores contacts for intent, drafts emails and LinkedIn messages in each seller's voice, and leaves a queue of personalised drafts for approval.**

That is, almost word for word, §5.3 of the improvements doc — the own-pipeline machine. Two useful signals from it:

- **The queue-for-approval pattern is the right shape.** Not "the agent sends", but "the agent prepares and a human releases." That is exactly how the outreach automation should be designed, and it maps onto the cockpit pattern already built.
- **Overnight research is where the value sits, not the sending.** The 18 emails sent on 10 September took an afternoon, and most of that afternoon was research, not writing. That is the part to automate.

**You do not need Grok Bot to build this.** You need n8n, the Claude API and a scoring prompt — all of which you already have and already pay for.

## 4.2 🟢 The second idea worth stealing: agents that hold their own state

Grok Bot's Bots remember previous conversations and learn how you like things done. The deeper principle behind it — **a persistent agent with its own memory and its own environment** — is what makes "chief of staff" coordination work.

The relevance to Ryvo is not the product, it is the shape: **the Zero ops agent in Phase 3 is the same idea.** Grok Bot is a usable reference implementation of how that interface should feel — messenger-style, delegate-and-walk-away, returns for approval.

## 4.3 🟡 Grok 4.1 Fast as a cost lever — later, not now

At **$0.20 / $0.50 per million tokens**, Grok 4.1 Fast is roughly an order of magnitude cheaper than Sonnet-class inference for the same job.

**Honest scale:** current Ryvo API spend is $6.99/month. Saving 80% of that is $5.60. It is not a lever until there are ten clients.

**And there is a hard blocker, see §5.2.** Even at scale this cannot be used for anything touching client lead data.

## 4.4 🟡 Grok 4.3's document generation — a possible fit for the weekly report

Grok 4.3 generates PDF, XLSX and PPTX natively, and accepts video input up to 5 minutes.

The weekly client performance report (§5.2 of the improvements doc) currently has no rendering path beyond HTML email. Native PDF generation is a plausible shortcut.

**But:** the report is built from Supabase numbers, not from AI reasoning, so this is a rendering convenience only — and it inherits the same data-residency blocker. **A Python PDF library does the same job with no vendor and no transfer.**

## 4.5 🔴 Real-time X data — not relevant here

xAI's genuine moat is direct access to real-time X data through X's 500M+ user base, which no competitor has.

**It does not help this business.** Boutique luxury property in Cascais, Estoril and Madrid does not transact on X. The market runs on Idealista, Imovirtual, personal networks and WhatsApp. This moat is real and it is pointed somewhere else.

---

# 5. Why not to build on it

## 5.1 🔴 The GDPR blocker is decisive

Ryvo's position is that **all personal data at rest stays in the EU** (Hetzner Germany, Supabase Frankfurt), and Ryvo is a **data processor** for each client agency.

Grok Bot holds real credentials to real client systems, on a **cloud VM that is shared across every Bot in the account** — the product's own documentation calls that shared computer "a real blast radius."

Cursor brings SOC 2 Type II, GDPR compliance and annual penetration testing. It has **engaged auditors to pursue ISO 27001 and ISO 42001 but holds neither.**

So to use Grok Bot on anything client-facing you would need a DPA with xAI, disclosure of them as a sub-processor to every client, and a defensible answer to "which EU region processes my clients' data." **That answer does not currently exist**, and every one of those conversations happens with an agency whose entire business is discretion.

**This is not a "later" problem. It is a no.**

## 5.2 🔴 $300/month against zero revenue

The only consumer route to Grok Bot is SuperGrok Heavy at $300/month. Current Ryvo infrastructure — server, database, API, domain — costs a fraction of that.

$300/month is roughly half a Core retainer. Paying it before signing a single client inverts the entire problem.

## 5.3 🔴 Beta reliability meets client-facing work

The 11 September rehearsal found five defects in a system built deliberately and tested at each checkpoint. Adding an autonomous, credential-holding beta agent to client-facing work right now is not a calculated risk, it is a category error.

xAI's own guidance says to start on low-stakes reversible tasks and keep humans in the loop on anything touching money, customers or production.

## 5.4 🔴 It solves a problem Ryvo does not have

Grok Bot's core advantage is operating software **that has no API**. Everything in the Ryvo stack has an API: WhatsApp, Google Calendar, Supabase, n8n, Anthropic. Browser-driving is a workaround for a constraint that does not apply.

---

# 6. The verdict

**Do not build on it. Do not subscribe. Steal two ideas and move on.**

| | |
|---|---|
| **Steal** | The queue-for-approval outreach pattern, and the persistent-agent interface shape for Zero |
| **Watch** | Grok 4.1 Fast pricing, in case an EU inference route appears |
| **Ignore** | Grok Bot as a product, real-time X data, Grok Imagine, the whole SpaceXAI narrative |
| **Revisit** | Q1 2027, or when a client asks about it |

## The wider point, worth more than the tool

The excitement is about **digital labour** — agents that do knowledge work rather than draft it. That category is real and the money is moving into it. Claude Cowork, ChatGPT Work, Copilot Cowork and Grok Bot are the same bet from four companies.

**The bet they are all making is that the model is the product.** It is not, for a business like this one. Every one of those four could point an agent at a Cascais estate agency tomorrow — and none of them knows what a CPCV is, when the escritura happens, which documents the buyer's bank needs, or why a €54,000 plot in Santarém means an agency is the wrong prospect.

**The model is a commodity that four giants are racing to give away.** The vertical knowledge is not, and it does not depreciate when the next flagship ships.

Chasing each new platform is the most expensive possible way to participate in this. The genuinely scarce asset is one paying agency whose process is understood end to end.

---

# 7. Sources

- unite.ai, "xAI Launches Grok Bot, Always-On AI Teammates With Their Own Cloud Computers" (11 Aug 2026)
- reworked.co, "xAI Wants In on the Enterprise With Grok Bot"
- InfoQ, "SpaceXAI Launches Grok Bot for Autonomous AI Agents"
- netalith.com, "What Is Grok Bot? xAI's New AI Agent Explained (2026)"
- ai-toolbox.co, Grok models and pricing guides (Aug 2026)
- cloudzero.com, "Grok pricing in 2026"
- aibusinessweekly.net, "Grok AI Pricing 2026"
- x.ai/news, release notes
- testingcatalog.com, "Grok Bot to get Templates and multi-account support soon"

**Note:** pricing and tiers change frequently. Confirm against x.ai and docs.x.ai before acting on any figure here.
