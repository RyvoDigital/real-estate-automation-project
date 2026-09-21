#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MEASURE the never-invent-a-time guard against REAL replies to an unoffered time.

  python3 tests/time_guard_measure.py [--per-lang 30] [--out /tmp/tg_measure.json]
  WORKFLOW_SRC=path/to/build.json  (default: the repo's workflows/ryvoInboundConc01.json)

Run ON THE SERVER (reads .env, renders the shipping blocks in the n8n container).

The shape is the deploy gate's: 09:00 and 10:00 on Thursday and 09:00 on Wednesday are
offered, the offer is in the history, and the lead asks for a time that was NOT offered,
in en, pt or es. Every reply is then put through src/time_guard.js exactly as ParseClaude
calls it (reply, the offered slots, the lead's message), and the script prints:

  * every REJECTION, for review: a rejection of a correct decline is a FALSE ESCALATION
    (the target is 0). A rejection of a reply that accepts or offers the lead's time is
    the guard doing its job.
  * every EXEMPTION, for review: an exempted time must be a decline of the lead's time.
    One that accepts or offers it is a FALSE ACCEPTANCE (must be 0).

Born 21 Sep 2026: the first deploy gate escalated "…09:00 or 10:00, but not 11:00".
"""
import argparse, json, os, re, subprocess, sys, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('--per-lang', type=int, default=30)
ap.add_argument('--out', default='/tmp/tg_measure.json')
args = ap.parse_args()

REPO = '/opt/ryvo-automation-platform'
E = {}
for l in open(REPO + '/.env'):
    l = l.strip()
    if l and not l.startswith('#') and '=' in l:
        k, v = l.split('=', 1); E[k] = v
WF = os.environ.get('WORKFLOW_SRC', REPO + '/workflows/ryvoInboundConc01.json')
os.environ['WORKFLOW_SRC'] = WF          # render_slots_block reads it too
_w = json.load(open(WF)); _w = _w[0] if isinstance(_w, list) else _w
_JS = next(n for n in _w['nodes'] if n['name'] == 'BuildClaudeRequest')['parameters']['jsCode']
SCHEMA = json.loads(re.search(r'const REPLY_SCHEMA = (\{.*?\});\n', _JS).group(1))
BASE = open(REPO + '/src/concierge_system_prompt.txt').read()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_slots_block import render as render_slots_block, CONTAINER

SLOT_LINES = ["Thursday 24 September 2026 at 09:00 Lisbon time",
              "Thursday 24 September 2026 at 10:00 Lisbon time",
              "Wednesday 23 September 2026 at 09:00 Lisbon time"]
OFFERED = [{'timeLocal': '09:00'}, {'timeLocal': '10:00'}]
SLOTS_BLOCK = render_slots_block(slot_lines=SLOT_LINES)

# Six ways to ask for an unoffered time, per language. Five of each = 30.
ASKS = {
    'en': [("Ok let's go with Thursday morning", "11:00?"), ("Thursday works", "Could we do 11:30 instead?"),
           ("Thursday please", "What about 12:00?"), ("Can I come Thursday?", "Is 16:00 possible?"),
           ("Thursday is good", "11:00 would be better for me"), ("Thursday morning", "Any chance of 13:30?")],
    'pt': [("Pode ser quinta de manhã", "Às 11:00?"), ("Quinta está bem", "E às 11:30?"),
           ("Quinta, por favor", "Pode ser às 12:00?"), ("Posso ir na quinta?", "Às 16:00 é possível?"),
           ("Quinta serve", "Preferia às 11:00"), ("Quinta de manhã", "Há hipótese às 13:30?")],
    'es': [("Vale, el jueves por la mañana", "¿A las 11:00?"), ("El jueves me va bien", "¿Y a las 11:30?"),
           ("El jueves, por favor", "¿Puede ser a las 12:00?"), ("¿Puedo ir el jueves?", "¿Es posible a las 16:00?"),
           ("El jueves está bien", "Preferiría a las 11:00"), ("Jueves por la mañana", "¿Hay alguna posibilidad a las 13:30?")],
}
OFFER = {'en': "I can offer Thursday 24 September 2026 at 09:00 or 10:00, or Wednesday 23 September 2026 at 09:00, all Lisbon time. Which would suit you?",
         'pt': "Posso oferecer quinta-feira, 24 de setembro de 2026, às 09:00 ou às 10:00, ou quarta-feira, 23 de setembro, às 09:00, hora de Lisboa. Qual prefere?",
         'es': "Puedo ofrecerle el jueves 24 de septiembre de 2026 a las 09:00 o a las 10:00, o el miércoles 23 de septiembre a las 09:00, hora de Lisboa. ¿Cuál le viene mejor?"}


def node(script, env=None):
    cmd = ['docker', 'exec', '-i'] + sum((['-e', f'{k}={v}'] for k, v in (env or {}).items()), []) + [CONTAINER, 'node', '-e', script]
    out = subprocess.run(cmd, capture_output=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.decode()[:400])
    return out.stdout.decode()


def language_note(text):
    return node(open(REPO + '/src/language.js').read() + "\n" + open(REPO + '/src/reply_language.js').read()
                + "\nprocess.stdout.write(renderReplyLanguageNote(detectLanguage(process.env.T).lang));", {'T': text})


def call(msgs, system):
    body = {"model": "claude-sonnet-5", "max_tokens": 1024, "system": system, "messages": msgs,
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}}}
    r = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(), method="POST")
    r.add_header("x-api-key", E['ANTHROPIC_API_KEY']); r.add_header("anthropic-version", "2023-06-01")
    r.add_header("content-type", "application/json")
    with urllib.request.urlopen(r, timeout=90) as x:
        d = json.loads(x.read().decode())
    return json.loads("".join(b["text"] for b in d["content"] if b["type"] == "text"))


rows = []
for lang, asks in ASKS.items():
    n = 0
    while n < args.per_lang:
        first, ask = asks[n % len(asks)]
        msgs = [{"role": "user", "content": first}, {"role": "assistant", "content": OFFER[lang]},
                {"role": "user", "content": ask}]
        try:
            p = call(msgs, BASE + language_note(ask) + SLOTS_BLOCK)
        except Exception as e:
            print(f'  call failed ({e}); retrying', flush=True); continue
        rows.append({'lang': lang, 'lead': ask, 'reply': p.get('reply', '')})
        n += 1
        print(f'  {lang} {n:2d}/{args.per_lang} {ask!r}', flush=True)
json.dump(rows, open(args.out, 'w'), ensure_ascii=False, indent=1)

# The guard, exactly as the source ships it.
verdicts = json.loads(node(open(REPO + '/src/time_guard.js').read() + r"""
const rows = JSON.parse(process.env.ROWS);
const offered = JSON.parse(process.env.OFFERED);
process.stdout.write(JSON.stringify(rows.map(r => {
  const rejected = timesNotSupplied(r.reply, offered, r.lead);
  const exempted = [...new Set(tgTimesIn(r.reply))].filter(t => tgTimesIn(r.lead).includes(t) && !rejected.includes(t)
    && !offered.some(o => tgNorm(...o.timeLocal.split(':')) === t));
  return { rejected, exempted };
})));""",
    {'ROWS': json.dumps(rows, ensure_ascii=False), 'OFFERED': json.dumps(OFFERED)}))
for r, v in zip(rows, verdicts): r.update(v)
json.dump(rows, open(args.out, 'w'), ensure_ascii=False, indent=1)

print('\nREJECTED (each is a false escalation unless the reply accepts or offers the time):')
for r in rows:
    if r['rejected']: print(f"  [{r['lang']}] {r['lead']!r} -> {r['rejected']} :: {r['reply']}")
print('\nEXEMPTED (each must be a decline; one that accepts or offers the time is a false acceptance):')
for r in rows:
    if r['exempted']: print(f"  [{r['lang']}] {r['lead']!r} -> {r['exempted']} :: {r['reply']}")
for lang in ASKS:
    rs = [r for r in rows if r['lang'] == lang]
    print(f"{lang}: {len(rs)} replies, rejected {sum(1 for r in rs if r['rejected'])}, "
          f"named the lead's time and exempted {sum(1 for r in rs if r['exempted'])}")
print(f'saved {args.out}')
