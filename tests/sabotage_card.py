#!/usr/bin/env python3
"""Build a SABOTAGE variant of the GATE COPY for the handoff card's live proof (§1f).

Starts from tests/ryvoInboundConc01.GATE.json (run tests/build_gate.py first), so every
outbound call still goes to the sink and the webhook is the gate's. Never commit, never
publish it as production. It behaves exactly like the gate copy unless the inbound message
carries a marker:

  SABOTAGE-CARD-INTERNAL -> ParseClaude throws (zone 2): the internal-failure path must
                            send the lead the handoff note AND the operator the card
                            (BuildOperatorAlertInternal -> NotifyOperatorInternal)
  SABOTAGE-CARD-BUILD    -> BuildOperatorAlert throws: its error output must still reach
                            NotifyOperator, whose Body falls back to the OLD three-line
                            alert, and the run row must say sent_as 'legacy' with an
                            operator_card.fell_back event. Send it with a request for a
                            person, so the message escalates.

Output: tests/ryvoInboundConc01.CARD.SABOTAGE.json (gitignored)

  python3 tests/build_gate.py && python3 tests/sabotage_card.py
  # import + publish it as the gate workflow, run tests/gate_card_paths.py --sabotage,
  # then import + publish the CLEAN gate copy again.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'ryvoInboundConc01.GATE.json')
OUT = os.path.join(HERE, 'ryvoInboundConc01.CARD.SABOTAGE.json')

w = json.load(open(SRC, encoding='utf-8'))
by = {n['name']: n for n in w['nodes']}
assert w['id'] == 'ryvoInboundConcGATE', 'start from the GATE copy, never the production build'

def trap(node, reader, marker):
    js = by[node]['parameters']['jsCode']
    line = ("// >>> SABOTAGE (tests/sabotage_card.py) >>>\n"
            "if (String((() => { try { return " + reader + "; } catch (e) { return ''; } })() || '').indexOf('"
            + marker + "') !== -1) throw new Error('" + marker + ": deliberate, for the live proof');\n"
            "// <<< SABOTAGE <<<\n")
    assert marker not in js, f'{node} is already sabotaged'
    by[node]['parameters']['jsCode'] = line + js

trap('ParseClaude', "$('AfterLead').first().json.body", 'SABOTAGE-CARD-INTERNAL')
trap('BuildOperatorAlert', "$('AfterHandoff').first().json.body", 'SABOTAGE-CARD-BUILD')

# Prove the two traps are the ONLY difference from the gate copy.
g = {n['name']: n for n in json.load(open(SRC, encoding='utf-8'))['nodes']}
diff = [n for n in by if json.dumps(by[n], sort_keys=True) != json.dumps(g[n], sort_keys=True)]
assert sorted(diff) == ['BuildOperatorAlert', 'ParseClaude'], diff
json.dump(w, open(OUT, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print(f'wrote {OUT}\n  sabotaged: {sorted(diff)} (and nothing else)')
