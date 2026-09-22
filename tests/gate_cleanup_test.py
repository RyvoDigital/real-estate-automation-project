#!/usr/bin/env python3
"""Tests for tests/gate_cleanup.py against a fake database (no network).

  python3 tests/gate_cleanup_test.py
"""
import copy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate_cleanup import clear_gate_escalations

passed = failed = 0
def chk(name, cond, detail=''):
    global passed, failed
    passed += bool(cond); failed += (not cond)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{'  ' + str(detail) if detail else ''}")


class FakeDB:
    def __init__(self, gate_only=True, patch_sticks=True):
        self.gate_only, self.patch_sticks = gate_only, patch_sticks
        self.leads = {
            'L1': {'id': 'L1', 'qualification': {'escalated': {'at': 't1', 'reasons': ['needs_human:x']}, 'bedrooms': 3}},
            'L2': {'id': 'L2', 'qualification': {'escalated': {'at': 't2', 'reason': 'booking_lost_race:y'}}},
            'L3': {'id': 'L3', 'qualification': {'bedrooms': 2}},
        }
        self.events, self.patches = [], []

    def __call__(self, method, path, body=None):
        if path.startswith('client_automations'):
            return [{'config': {'gate_only': True} if self.gate_only else {}}]
        if method == 'GET' and path.startswith('leads?select=id,qualification'):
            return [copy.deepcopy(l) for l in self.leads.values() if l['qualification'].get('escalated')]
        if method == 'PATCH':
            lid = path.split('id=eq.')[1].split('&')[0]
            self.patches.append((lid, path))
            if self.patch_sticks:
                self.leads[lid]['qualification'] = body['qualification']
            return None
        if method == 'GET' and path.startswith('leads?select=qualification&id=eq.'):
            return [copy.deepcopy(self.leads[path.split('id=eq.')[1]])]
        if method == 'POST' and path == 'events':
            self.events.append(body); return None
        raise AssertionError('unexpected call: ' + method + ' ' + path)


print('\nthe gate client: every escalated lead cleared, the cockpit way')
db = FakeDB()
cleared, failures = clear_gate_escalations(db, 'GATE')
chk('two cleared, none failed', cleared == 2 and failures == [], (cleared, failures))
chk('  the escalated key is gone from both', all('escalated' not in db.leads[i]['qualification'] for i in ('L1', 'L2')))
chk('  cleared_at and cleared_by stamped', all(db.leads[i]['qualification'].get('escalation_cleared_by') == 'gate harness' and db.leads[i]['qualification'].get('escalation_cleared_at') for i in ('L1', 'L2')))
chk('  other qualification fields kept', db.leads['L1']['qualification'].get('bedrooms') == 3)
chk('  the lead that was not escalated is untouched', 'escalation_cleared_at' not in db.leads['L3']['qualification'])
chk('  every PATCH is scoped to the gate client too', all('client_id=eq.GATE' in p for _, p in db.patches), db.patches)
chk('  one lead.escalation_cleared event each, with the previous reasons', len(db.events) == 2 and db.events[0]['type'] == 'lead.escalation_cleared'
    and db.events[0]['data']['previous_reasons'] == ['needs_human:x'] and db.events[1]['data']['previous_reasons'] == ['booking_lost_race:y']
    and all(e['data']['source'] == 'gate_harness' for e in db.events), db.events)

print('\nrefuses any client not marked gate_only')
try:
    clear_gate_escalations(FakeDB(gate_only=False), 'REAL')
    chk('a real client is refused', False, 'it cleared a non-gate client')
except RuntimeError as e:
    chk('a real client is refused', 'gate_only' in str(e), e)

print('\na write that did not stick is a failure, not a clear (read back, never trust the status)')
db = FakeDB(patch_sticks=False)
cleared, failures = clear_gate_escalations(db, 'GATE')
chk('nothing counted as cleared, both reported', cleared == 0 and sorted(failures) == ['L1', 'L2'], (cleared, failures))
chk('  and no event claims a clear that did not happen', db.events == [])

print(f'\n  {passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
