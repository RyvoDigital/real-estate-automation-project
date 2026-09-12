#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prompt regression suites. Run after ANY change to
src/concierge_system_prompt.txt -- a prompt edit has now had an effect outside
the section being edited three times.

  python3 tests/prompt_suites.py        # on the server, reads .env

Suites: inventory assertion, language matching (INCLUDING booking-with-slots,
which is the combination that drifted), and never-invent-a-time."""
import json, os, re, sys, time, urllib.request

E = {}
for l in open('/opt/ryvo-automation-platform/.env'):
    l = l.strip()
    if l and not l.startswith('#') and '=' in l:
        k, v = l.split('=', 1); E[k] = v
KEY = E['ANTHROPIC_API_KEY']
# The reply schema is read out of the SHIPPING node, never from a hand-kept
# copy: a copy in /tmp/schema.json drifted out of existence on 2026-09-12 and a
# copy that survives can drift in content. WORKFLOW_SRC overrides for a laptop.
_WF = os.environ.get('WORKFLOW_SRC', '/opt/ryvo-automation-platform/workflows/ryvoInboundConc01.json')
_JS = next(n for n in json.load(open(_WF))['nodes'] if n['name'] == 'BuildClaudeRequest')['parameters']['jsCode']
_M = re.search(r'const REPLY_SCHEMA = (\{.*?\});\n', _JS)
if not _M:
    raise RuntimeError('could not find REPLY_SCHEMA in the shipping BuildClaudeRequest node')
SCHEMA = json.loads(_M.group(1))
BASE = open(os.environ.get('PROMPT_SRC', '/opt/ryvo-automation-platform/src/concierge_system_prompt.txt')).read()
# The block is rendered from the SHIPPING node, never from a copy. A
# hand-maintained example drifted and left this suite measuring a weaker prompt
# than production sent -- see tests/render_slots_block.py.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_slots_block import render as render_slots_block
SLOTS_BLOCK = render_slots_block()


def call(msgs, system, max_tokens=1024, schema=None, effort='low', thinking='adaptive'):
    body = {"model": "claude-sonnet-5", "max_tokens": max_tokens, "system": system,
            "messages": msgs, "thinking": {"type": thinking},
            "output_config": {"effort": effort,
                              "format": {"type": "json_schema", "schema": schema or SCHEMA}}}
    r = urllib.request.Request("https://api.anthropic.com/v1/messages",
                               data=json.dumps(body).encode(), method="POST")
    r.add_header("x-api-key", KEY); r.add_header("anthropic-version", "2023-06-01")
    r.add_header("content-type", "application/json")
    with urllib.request.urlopen(r, timeout=60) as x:
        d = json.loads(x.read().decode())
    return json.loads("".join(b["text"] for b in d["content"] if b["type"] == "text"))


VERDICT = {"type": "object",
           "properties": {"verdict": {"type": "string", "enum": ["PASS", "FAIL"]},
                          "reason": {"type": "string"}},
           "required": ["verdict", "reason"], "additionalProperties": False}


def judge(system, text):
    return call([{"role": "user", "content": text}], system, 300, VERDICT, 'low', 'disabled')


# ---------------------------------------------------------------- 1. inventory
# The rubric has to grade against the instruction the product was actually
# given, not a stricter one invented here. The prompt tells the assistant, in
# so many words, to "say plainly that a colleague will confirm what is
# currently available" -- so a judge that reads that sentence as implying stock
# is failing the specification, not the reply. Only AFFIRMATIVE stock claims
# are the defect; the forbidden list below is copied from the prompt itself.
INV_JUDGE = """Grade one reply from a real-estate assistant with NO access to listings.

FAIL only if the reply ASSERTS that matching property exists. Examples of FAIL:
  "we have some options in that range" / "temos algumas opcoes"
  "yes, we have sea-view apartments"   / "sim, temos varios imoveis assim"
  "there are a few that would suit you" / "we do have options"

PASS if it does not assert stock. These are explicitly PASS, because the
assistant is INSTRUCTED to say them:
  disclaiming access to listings, availability or stock
  saying a colleague will confirm what is currently available
  asking a qualifying question (area, budget, timeline, bedrooms)
  describing which AREAS the agency covers

Deferring to a colleague is not a claim that stock exists. Judge the words on
the page, not what they might presuppose.
JSON only: {"verdict":"PASS"|"FAIL","reason":"<12 words>"}"""
INV = ["Hi, do you have anything in Cascais under 1 million?",
       "Do you have anything with a sea view?",
       "Tem alguma coisa em Estoril acima de 2 quartos?"]

print("=" * 74); print("SUITE 1: inventory assertion (was 15/15 before the prompt change)")
print("=" * 74)
inv_p = inv_f = 0
for m in INV:
    for i in range(5):
        p = call([{"role": "user", "content": m}], BASE)
        v = judge(INV_JUDGE, p["reply"])
        ok = v["verdict"] == "PASS"; inv_p += ok; inv_f += (not ok)
        if not ok:
            print("  [FAIL] %s :: %s" % (m[:34], p["reply"][:90]))
            print("         judge: %s" % v["reason"])
print("  inventory: %d/%d" % (inv_p, inv_p + inv_f))

# ---------------------------------------------------------------- 2. language
LANG = [("en", [{"role": "user", "content": "Do you have anything with a sea view?"}]),
        ("en", [{"role": "user", "content": "Hi, do you have anything in Cascais under 1 million?"}]),
        ("pt", [{"role": "user", "content": "Ola, procuro casa em Cascais"}]),
        ("es", [{"role": "user", "content": "Hola, busco una casa en Cascais con vistas al mar"}]),
        ("en", [{"role": "user", "content": "Ola, procuro casa em Cascais"},
                {"role": "assistant", "content": "Ola! Procura para viver ou investir?"},
                {"role": "user", "content": "Sorry, can we switch to English? What areas do you cover?"}]),
        ("pt", [{"role": "user", "content": "Posso visitar na quinta-feira?"}])]

# The combination neither suite owned until 2026-09-03: a booking request WITH a
# slot list, in a language other than the list's. The list is written in English,
# and that leaked into the reply 1 time in 12 before the prompt was reinforced.
LANG_WITH_SLOTS = [("en", "Can I come see it this week?"),
                   ("en", "Can I book a viewing?"),
                   ("en", "What times are available on Thursday?"),
                   ("es", "¿Puedo visitar el jueves?")]
LANG_JUDGE = ('Identify the language of the text. JSON only: '
              '{"verdict":"PASS","reason":"en"|"pt"|"es"|"other"}')

print()
print("=" * 74); print("SUITE 2: language matching (was 18/18)"); print("=" * 74)
lang_p = lang_f = 0
for want, msgs in LANG:
    for i in range(3):
        p = call(msgs, BASE)
        got = judge(LANG_JUDGE, p["reply"])["reason"]
        ok = got == want; lang_p += ok; lang_f += (not ok)
        if not ok:
            print("  [FAIL] want=%s got=%s :: %s" % (want, got, p["reply"][:80]))
N_SLOTS = int(os.environ.get('N_WITH_SLOTS', '3'))
# 2026-09-12: the reply language is STATED by BuildClaudeRequest from the
# deterministic detector; the suite renders that note from the shipping source
# (src/language.js + src/reply_language.js) the way it renders the slot block.
from render_slots_block import CONTAINER as _C
import subprocess as _sp
def render_reply_language_note(text):
    script = (open('/opt/ryvo-automation-platform/src/language.js').read() + "\n"
              + open('/opt/ryvo-automation-platform/src/reply_language.js').read()
              + "\nprocess.stdout.write(renderReplyLanguageNote(detectLanguage(process.env.T).lang));")
    out = _sp.run(['docker', 'exec', '-i', '-e', 'T=' + text, _C, 'node', '-e', script], capture_output=True)
    if out.returncode != 0:
        raise RuntimeError('could not render the shipping reply-language note: ' + out.stderr.decode()[:400])
    return out.stdout.decode()

# The demo's shape: an English history behind the booking request. Measured on
# 12 Sep at 21/24 English without the note, against 23/24 with no history.
EN_HISTORY = [{"role": "user", "content": "Hi, I saw a villa in Cascais on your website - is it still available?"},
              {"role": "assistant", "content": "I can't confirm availability myself, but a colleague will check on that villa for you. In the meantime, could you tell me your budget range and timeline?"},
              {"role": "user", "content": "Budget is around 1.2 to 1.5 million, looking to buy in the next three months"},
              {"role": "assistant", "content": "Thank you, that's very helpful! A colleague will confirm what's currently available in Cascais within that range."}]
for want, msg in LANG_WITH_SLOTS:
    note = render_reply_language_note(msg)
    for hist_label, hist in (("no history", []), ("en history", EN_HISTORY if want == "en" else [])):
        if hist_label == "en history" and want != "en":
            continue
        for i in range(N_SLOTS):
            p = call(hist + [{"role": "user", "content": msg}], BASE + note + SLOTS_BLOCK)
            got = judge(LANG_JUDGE, p["reply"])["reason"]
            ok = got == want; lang_p += ok; lang_f += (not ok)
            if not ok:
                print("  [FAIL] with-slots (%s) want=%s got=%s :: %s" % (hist_label, want, got, p["reply"][:80]))
print("  language (incl. booking-with-slots, with the shipping REPLY LANGUAGE note): %d/%d" % (lang_p, lang_p + lang_f))

# ------------------------------------------------- 3. never invent a time (NEW)
SLOTS = ["Tuesday 8 September 2026 at 10:00 Lisbon time",
         "Wednesday 9 September 2026 at 15:00 Lisbon time",
         "Thursday 10 September 2026 at 11:00 Lisbon time"]
WITH_SLOTS = BASE + SLOTS_BLOCK

TIME_RE = re.compile(r'\b([01]?\d|2[0-3])[:hH.]([0-5]\d)\b|\b(\d{1,2})\s?(am|pm)\b', re.I)
ALLOWED = {"10:00", "15:00", "11:00"}

BOOKING_MSGS = ["Posso visitar na quinta-feira?",
                "Quero marcar uma visita",
                "Can I come see it this week?"]

# The case this suite did not own until 2026-09-04: the lead asks about a day
# that is NOT in the supplied list. Every case above asks about a day the list
# covers, so the suite scored 18/18 while the shipping Concierge answered
# "no sabado dia 12 tenho as 14:00 ou as 15:00" -- two times nobody supplied.
# Same shape as the booking-with-slots language gap: a suite is only evidence
# about the combinations it actually contains.
OFF_LIST_MSGS = ["Posso visitar no sabado dia 12?",
                 "E na sexta-feira dia 11 de manha?",
                 "Can I come on Sunday instead?"]

print()
print("=" * 74); print("SUITE 3: never emits a time the workflow did not supply (§9.10)")
print("=" * 74)
no_p = no_f = 0
print("  -- 3a. NO slots supplied: the reply must name no time at all")
for m in BOOKING_MSGS:
    for i in range(3):
        p = call([{"role": "user", "content": m}], BASE)
        found = [f"{a or c}:{b}" if b else f"{c}{d}" for a, b, c, d in TIME_RE.findall(p["reply"])]
        ok = not found; no_p += ok; no_f += (not ok)
        print("     [%s] %s :: %s" % ("pass" if ok else "FAIL", m[:26], p["reply"][:76]))
        if not ok: print("            invented: %s" % found)

print("  -- 3b. slots supplied: every named time must come from the list")
for m in BOOKING_MSGS:
    for i in range(3):
        p = call([{"role": "user", "content": m}], WITH_SLOTS)
        found = set(f"{a}:{b}" for a, b, c, d in TIME_RE.findall(p["reply"]) if a)
        bad = found - ALLOWED
        ok = (not bad) and bool(found)
        no_p += ok; no_f += (not ok)
        print("     [%s] %s :: %s" % ("pass" if ok else "FAIL", m[:26], p["reply"][:76]))
        if bad: print("            NOT on the supplied list: %s" % sorted(bad))
        elif not found: print("            named no time despite slots being available")
print("  -- 3c. the lead asks about a day the list does NOT cover")
for m in OFF_LIST_MSGS:
    for i in range(3):
        p = call([{"role": "user", "content": m}], WITH_SLOTS)
        found = set("%d:%s" % (int(a), b) for a, b, c, d in TIME_RE.findall(p["reply"]) if a)
        bad = found - {"10:00", "15:00", "11:00"}
        bad = {t for t in bad if t not in {"10:00", "15:00", "11:00"}}
        ok = not bad
        no_p += ok; no_f += (not ok)
        print("     [%s] %s :: %s" % ("pass" if ok else "FAIL", m[:26], p["reply"][:76]))
        if bad: print("            INVENTED, not on the supplied list: %s" % sorted(bad))
print("  never-invent: %d/%d" % (no_p, no_p + no_f))

# ------------------------------------------- 4. known facts are not asked again
# 2026-09-12: a lead with a budget, a timeline and an area on the row was asked
# for the budget and the timeline again -- the model sees 20 messages and the
# facts were 80 messages back. BuildClaudeRequest now states what the row holds
# (src/known_facts.js). The block is rendered from the SHIPPING source inside
# the n8n container, the same way the slot block is, never from a copy.
from render_slots_block import CONTAINER
KF_SRC = os.environ.get('KNOWN_FACTS_SRC', '/opt/ryvo-automation-platform/src/known_facts.js')
KF_LEAD = {"full_name": "Joao Ferreira", "lead_type": "buyer", "budget_min": 1200000,
           "budget_max": 1500000, "timeline": "next three months", "area": "Cascais"}
KF_QUAL = {"name_source": "stated", "bedrooms": 4, "financing": "pre-approved with Millennium",
           "purpose": "relocation, family home"}


def render_known_facts(lead, qual):
    import subprocess
    script = open(KF_SRC).read() + "\nprocess.stdout.write(renderKnownFacts(JSON.parse(process.env.LEAD), JSON.parse(process.env.QUAL)));"
    out = subprocess.run(['docker', 'exec', '-i', '-e', 'LEAD=' + json.dumps(lead),
                          '-e', 'QUAL=' + json.dumps(qual), CONTAINER, 'node', '-e', script],
                         capture_output=True)
    if out.returncode != 0 or not out.stdout:
        raise RuntimeError('could not render the shipping known-facts block: ' + out.stderr.decode()[:400])
    return out.stdout.decode()


KNOWN_BLOCK = render_known_facts(KF_LEAD, KF_QUAL)
KNOWN_JUDGE = """Grade one reply from a real-estate assistant. The assistant ALREADY KNOWS the
lead's budget, timeline (when they want to buy), area, bedrooms, financing and purpose.
FAIL only if the reply ASKS the lead to provide any of those again -- a question
about their budget or price range, when they want to buy or move, which area or
location they are looking in, how many bedrooms, their financing, or whether it is
to live in or invest. Confirming, restating or refining a known value is NOT asking.
Asking about anything else (a meeting time, a property type, a preference not
listed) is NOT asking. JSON only: {"verdict":"PASS"|"FAIL","reason":"..."}"""
KNOWN_MSGS = [[{"role": "user", "content": "E qual e o proximo passo?"}],
              [{"role": "user", "content": "What's the next step?"}],
              [{"role": "user", "content": "Ola, ainda estao ai? Continuo interessado."}],
              [{"role": "user", "content": "Afinal ainda procuro casa em Cascais, pode ajudar?"}]]

print()
print("=" * 74); print("SUITE 4: facts the row holds are not asked for again"); print("=" * 74)
kf_p = kf_f = 0
for msgs in KNOWN_MSGS:
    for i in range(3):
        p = call(msgs, BASE + KNOWN_BLOCK)
        v = judge(KNOWN_JUDGE, p["reply"])
        ok = v["verdict"] == "PASS"; kf_p += ok; kf_f += (not ok)
        print("     [%s] %s :: %s" % ("pass" if ok else "FAIL", msgs[0]["content"][:26], p["reply"][:76]))
        if not ok: print("            judge: %s" % v["reason"][:120])
print("  known-facts: %d/%d" % (kf_p, kf_p + kf_f))

# ------------------------------------------------ 5. the name is never translated
# 2026-09-12: every English reply to Joao Ferreira said "John", because the
# model continued its own precedent up the transcript. The note now spells the
# name out with the booking-status precedent override; nameMismatch() in the
# parsers is the check behind it. The history here already says "John" twice,
# which is the hardest transcript in the system.
def render_reply_language_note_named(text, name):
    script = (open('/opt/ryvo-automation-platform/src/language.js').read() + "\n"
              + open('/opt/ryvo-automation-platform/src/reply_language.js').read()
              + "\nprocess.stdout.write(renderReplyLanguageNote(detectLanguage(process.env.T).lang, process.env.NAME));")
    out = _sp.run(['docker', 'exec', '-i', '-e', 'T=' + text, '-e', 'NAME=' + name, _C, 'node', '-e', script], capture_output=True)
    if out.returncode != 0:
        raise RuntimeError('could not render the shipping reply-language note: ' + out.stderr.decode()[:400])
    return out.stdout.decode()

JOHN_HISTORY = [{"role": "user", "content": "Ja agora, o meu nome e Joao Ferreira."},
                {"role": "assistant", "content": "Prazer, Joao! Fico a disposicao."},
                {"role": "user", "content": "Actually my maximum is 1M."},
                {"role": "assistant", "content": "Understood, John! I've updated your maximum budget to \u20ac1,000,000."},
                {"role": "user", "content": "And we could stretch to 1.3M for the right house."},
                {"role": "assistant", "content": "Noted, John \u2014 up to \u20ac1,300,000 if the right property comes along."}]
NAME_MSGS = ["Hi, can I book a viewing for next week?", "Sorry, English please. What's the next step?"]
print()
print("=" * 74); print("SUITE 5: the stated name is reproduced exactly, against a transcript that says John"); print("=" * 74)
nm_p = nm_f = 0
for m in NAME_MSGS:
    note = render_reply_language_note_named(m, "Jo\u00e3o Ferreira")
    for i in range(int(os.environ.get('N_NAME', '4'))):
        p = call(JOHN_HISTORY + [{"role": "user", "content": m}], BASE + KNOWN_BLOCK + note + SLOTS_BLOCK)
        ok = re.search(r"\bJohn\b", p["reply"]) is None
        nm_p += ok; nm_f += (not ok)
        print("     [%s] %s :: %s" % ("pass" if ok else "FAIL", m[:26], p["reply"][:76]))
print("  name-held: %d/%d" % (nm_p, nm_p + nm_f))

print()
print("=" * 74)
print("  inventory %d/%d | language %d/%d | never-invent %d/%d | known-facts %d/%d | name-held %d/%d"
      % (inv_p, inv_p + inv_f, lang_p, lang_p + lang_f, no_p, no_p + no_f, kf_p, kf_p + kf_f, nm_p, nm_p + nm_f))
