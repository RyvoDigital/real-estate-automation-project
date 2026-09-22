"""EVERY MESSAGE A GATE RUN DELIVERED, READ BY THE SAME DETECTOR THE WORKFLOW USES.

Imported by tests/gate_run.py and tests/gate_booking.py (22 Sep 2026, Defect D).

The 20-run gate passed a conversation in which a lead was sent " only be2509:00
September25:00 09Lisbon time … 」use دdireidply,". It counted escalations,
invariants and languages, and never read whether what was sent was a sentence.
So both gate scripts now read every outbound message of the gate client in
their window (the model's replies and the handoff notes) with replyLooksBroken()
from src/parse_reply.js, the one rule, run by the n8n container's own Node,
and any hit fails the gate.

The detector file is passed in, never copied: the script is often run from
/tmp, so the caller names the parse_reply.js of the BUILD under test.
"""
import json, subprocess, urllib.parse

DETECT_JS = r"""
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const f = new Function(input.src + '\nreturn replyLooksBroken;')();
const out = input.texts.map(t => { let v = null; try { v = f(t.body); } catch (e) { v = 'detector threw: ' + e.message; } return v ? { id: t.id, at: t.at, origin: t.origin, why: v } : null; }).filter(Boolean);
process.stdout.write(JSON.stringify(out));
"""


def delivered_broken(db, client_id, since_iso, parse_reply_src):
    """-> (number of messages read, [{id, at, origin, why}] for each that looks broken)."""
    q = urllib.parse.quote
    rows = db('GET', f'messages?select=id,origin,body,created_at&client_id=eq.{client_id}&direction=eq.outbound'
                     f'&created_at=gte.{q(since_iso)}&order=created_at.asc')
    texts = [{'id': r['id'], 'at': r['created_at'], 'origin': r['origin'], 'body': r['body'] or ''} for r in rows]
    src = open(parse_reply_src, encoding='utf-8').read()
    if 'function replyLooksBroken' not in src:
        raise RuntimeError(f'{parse_reply_src} has no replyLooksBroken: refusing to report a clean scan')
    p = subprocess.run(['docker', 'exec', '-i', 'infra-n8n-1', 'node', '-e', DETECT_JS],
                       input=json.dumps({'src': src, 'texts': texts}), capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError('the delivered-message scan failed: ' + p.stderr[-400:])
    return len(texts), json.loads(p.stdout or '[]')
