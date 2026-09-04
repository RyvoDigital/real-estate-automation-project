# -*- coding: utf-8 -*-
"""Render the AVAILABLE_SLOTS block EXACTLY as BuildClaudeRequest builds it.

Why this exists: `src/available_slots_block.example.txt` was a hand-maintained
copy, and it drifted. By 2026-09-04 it was missing the "Translate weekday and
month names" sentence that production actually sends -- so the language suite
was measuring a weaker prompt than the workflow uses, and reporting a failure
rate that did not belong to the shipping system. That is the ninth instance of
"a test that passes while testing the wrong thing" (engineering-lessons.md §1).

The block is sliced out of the shipping node between two fixed markers and
evaluated by node inside the n8n container -- Python does no JS parsing beyond
the substring, node does all the semantics. If it cannot render, it RAISES.
Falling back to a stale copy is the failure mode this file exists to remove.
"""
import json, os, subprocess

WF = os.environ.get('WORKFLOW_SRC',
                    '/opt/ryvo-automation-platform/workflows/ryvoInboundConc01.json')
CONTAINER = os.environ.get('N8N_CONTAINER', 'infra-n8n-1')
START = "if ((sl.slotLines || []).length) {"
END = "\n\nreturn [{ json: {"

DEFAULT_LINES = ["Tuesday 8 September 2026 at 10:00 Lisbon time",
                 "Wednesday 9 September 2026 at 15:00 Lisbon time",
                 "Thursday 10 September 2026 at 11:00 Lisbon time"]


def render(slot_lines=None, prefer_requested=None, prefer_status='none',
           min_hours_notice=24):
    nodes = json.load(open(WF))['nodes']
    js = next(n for n in nodes if n['name'] == 'BuildClaudeRequest')['parameters']['jsCode']
    i = js.index(START)
    frag = js[i:js.index(END, i)]

    sl = {'slotLines': DEFAULT_LINES if slot_lines is None else slot_lines,
          'preferRequested': prefer_requested, 'preferStatus': prefer_status}
    script = ("let system = '';\n"
              "const cfg = { min_hours_notice: %d };\n"
              "const sl = JSON.parse(process.env.SL);\n"
              "%s\n"
              "process.stdout.write(system);" % (min_hours_notice, frag))
    out = subprocess.run(['docker', 'exec', '-i', '-e', 'SL=' + json.dumps(sl),
                          CONTAINER, 'node', '-e', script],
                         capture_output=True)
    if out.returncode != 0:
        raise RuntimeError('could not render the shipping slot block: '
                           + out.stderr.decode()[:400])
    return out.stdout.decode()


if __name__ == '__main__':
    print(render())
    print('---- with an unusable requested day ----')
    print(render(prefer_requested='2026-09-06', prefer_status='closed_day'))
