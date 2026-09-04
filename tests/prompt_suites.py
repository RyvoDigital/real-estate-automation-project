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
SCHEMA = json.load(open('/tmp/schema.json'))
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
for want, msg in LANG_WITH_SLOTS:
    for i in range(N_SLOTS):
        p = call([{"role": "user", "content": msg}], BASE + SLOTS_BLOCK)
        got = judge(LANG_JUDGE, p["reply"])["reason"]
        ok = got == want; lang_p += ok; lang_f += (not ok)
        if not ok:
            print("  [FAIL] with-slots want=%s got=%s :: %s" % (want, got, p["reply"][:80]))
print("  language (incl. booking-with-slots): %d/%d" % (lang_p, lang_p + lang_f))

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

print()
print("=" * 74)
print("  inventory %d/%d | language %d/%d | never-invent %d/%d"
      % (inv_p, inv_p + inv_f, lang_p, lang_p + lang_f, no_p, no_p + no_f))
