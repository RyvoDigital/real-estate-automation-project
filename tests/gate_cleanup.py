"""THE GATE CLEARS WHAT IT ESCALATES.

Imported by tests/gate_run.py and tests/gate_booking.py (22 Sep 2026).

Every "Talk to a human" and every lost race leaves an escalated lead under the
gate client, all named João. By 22 Sep the cockpit's Queue held 78 of them, and
the operator handed back one of them instead of the Ryvo Test Client's lead.
The cockpit now hides the gate client from its lists (by the gate_only marker);
this is the other half: at the end of a run, every escalated lead of the gate
client is cleared, so nothing accumulates. It clears the whole client, not only
this run's leads, so a backlog left by an interrupted run goes too.

The clear is the cockpit's clearEscalation (cockpit/src/lib/actions.ts), step
for step: delete qualification.escalated, stamp escalation_cleared_at and
escalation_cleared_by, READ THE ROW BACK (a green write is not evidence), and
write lead.escalation_cleared with what the escalation was. If the cockpit's
version changes, change this one with it.

Refuses to touch any client whose automation is not marked gate_only.
"""
import datetime, urllib.parse

GATE_AUTOMATION = 'ebd13145-d1c7-4a29-92e4-9c107560c2ef'   # inbound_concierge


def clear_gate_escalations(db, client_id, by='gate harness'):
    """-> (cleared, failures). Raises if client_id is not the gate client."""
    q = urllib.parse.quote
    ca = db('GET', f'client_automations?select=config&client_id=eq.{client_id}&automation_id=eq.{GATE_AUTOMATION}')
    if not ca or (ca[0].get('config') or {}).get('gate_only') is not True:
        raise RuntimeError(f'client {client_id} is not marked gate_only: refusing to clear its escalations')
    leads = db('GET', f'leads?select=id,qualification&client_id=eq.{client_id}&qualification->escalated=not.is.null')
    cleared, failures = 0, []
    for lead in leads:
        qual = dict(lead.get('qualification') or {})
        before = qual.get('escalated')
        if not before:
            continue
        del qual['escalated']
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        qual['escalation_cleared_at'] = now
        qual['escalation_cleared_by'] = by
        db('PATCH', f'leads?id=eq.{lead["id"]}&client_id=eq.{client_id}', {'qualification': qual, 'updated_at': now})
        after = db('GET', f'leads?select=qualification&id=eq.{lead["id"]}')
        if not after or (after[0].get('qualification') or {}).get('escalated'):
            failures.append(lead['id'])
            continue
        db('POST', 'events', {'client_id': client_id, 'type': 'lead.escalation_cleared', 'severity': 'info',
                              'summary': f'Escalation cleared by {by}',
                              'data': {'lead_id': lead['id'], 'cleared_by': by, 'cleared_at': now,
                                       'previous_reasons': before.get('reasons') or ([before['reason']] if before.get('reason') else []),
                                       'escalated_at': before.get('at'), 'source': 'gate_harness'}})
        cleared += 1
    return cleared, failures
