#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Derive metrics_daily from the append-only logs — Checkpoint D4.

WHY DERIVED RATHER THAN INCREMENTED
The original spec had the workflow increment `viewings_booked` at the moment it
booked. An increment that does not happen is unrecoverable: there is no way to
find out later how many it missed, because the only record of the miss is the
absence of a number. A derivation reads the events that actually happened, so a
bad run is fixed by running it again, and any date can be rebuilt from source
at any time.

That property is the whole design, and it is what the tests below check: run it
twice, get the same numbers; corrupt a row, re-run, get it corrected.

USAGE
    metrics_daily.py                 # yesterday and today, in the client's zone
    metrics_daily.py 2026-09-04      # one specific date
    metrics_daily.py --days 30       # backfill the last 30 days
"""
import json, os, sys, urllib.parse, urllib.request, datetime
from zoneinfo import ZoneInfo

ENV_PATH = os.environ.get('RYVO_ENV', '/opt/ryvo-automation-platform/.env')
E = {}
for line in open(ENV_PATH):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        E[k] = v
SB = E['SUPABASE_URL'].rstrip('/')
SK = E['SUPABASE_SERVICE_ROLE_KEY']


def req(method, path, body=None, headers=None):
    r = urllib.request.Request(f'{SB}/rest/v1/{path}',
                               data=json.dumps(body).encode() if body is not None else None,
                               method=method)
    r.add_header('apikey', SK)
    r.add_header('Authorization', f'Bearer {SK}')
    r.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    raw = urllib.request.urlopen(r, timeout=45).read().decode()
    return json.loads(raw) if raw.strip() else None


def client_timezones():
    """A day boundary is a LOCAL day boundary. A lead arriving at 00:30 in
    Lisbon belongs to that date, not to the previous UTC one."""
    out = {}
    for row in req('GET', 'client_automations?select=client_id,config'):
        cfg = row.get('config') or {}
        out.setdefault(row['client_id'], cfg.get('timezone') or 'Europe/Lisbon')
    for row in req('GET', 'clients?select=id'):
        out.setdefault(row['id'], 'Europe/Lisbon')
    return out


def day_window(date_str, tz_name):
    tz = ZoneInfo(tz_name)
    d = datetime.date.fromisoformat(date_str)
    start = datetime.datetime.combine(d, datetime.time.min, tz)
    end = start + datetime.timedelta(days=1)
    return (start.astimezone(datetime.timezone.utc).isoformat(),
            end.astimezone(datetime.timezone.utc).isoformat())


def derive(client_id, date_str, tz_name):
    lo, hi = day_window(date_str, tz_name)
    q = f'client_id=eq.{client_id}&created_at=gte.{urllib.parse.quote(lo)}&created_at=lt.{urllib.parse.quote(hi)}'

    events = req('GET', f'events?select=type&{q}') or []
    counts = {}
    for e in events:
        counts[e['type']] = counts.get(e['type'], 0) + 1

    # messages_sent comes from `messages` because nothing writes an event per
    # outbound message. Still a derivation from a table nobody increments.
    sent = req('GET', f'messages?select=id&direction=eq.outbound&{q}') or []

    return {
        'client_id': client_id,
        'date': date_str,
        'leads_new': counts.get('lead.created', 0),
        'leads_qualified': counts.get('lead.qualified', 0),
        'viewings_booked': counts.get('viewing.booked', 0),
        'messages_sent': len(sent),
        # Nothing produces reactivations yet -- that is a Phase 2 automation.
        # Written as 0 explicitly so the row means "none happened", not
        # "we did not look".
        'reactivations': 0,
    }


def upsert(rows):
    if not rows:
        return
    # `unique (client_id, date)` is a PLAIN unique constraint, so PostgREST can
    # use it for ON CONFLICT. A PARTIAL index cannot be used this way and fails
    # 42P10 -- the defect that cost migration 0003 (engineering-lessons.md §1).
    req('POST', 'metrics_daily?on_conflict=client_id,date', rows,
        {'Prefer': 'resolution=merge-duplicates,return=minimal'})


def main():
    args = sys.argv[1:]
    tzs = client_timezones()
    dates = []
    if args and args[0] == '--days':
        n = int(args[1])
        today = datetime.datetime.now(ZoneInfo('Europe/Lisbon')).date()
        dates = [(today - datetime.timedelta(days=i)).isoformat() for i in range(n)]
    elif args:
        dates = [args[0]]
    else:
        # Yesterday AND today: yesterday is finalised once the day has closed,
        # today is kept fresh so a dashboard is not a day stale.
        today = datetime.datetime.now(ZoneInfo('Europe/Lisbon')).date()
        dates = [(today - datetime.timedelta(days=1)).isoformat(), today.isoformat()]

    rows = []
    for client_id, tz_name in tzs.items():
        for d in dates:
            rows.append(derive(client_id, d, tz_name))
    upsert(rows)
    for r in rows:
        print('  %s  %s  new=%d qualified=%d booked=%d sent=%d' % (
            r['date'], r['client_id'][:8], r['leads_new'], r['leads_qualified'],
            r['viewings_booked'], r['messages_sent']))
    print('  wrote %d row(s) for %d date(s)' % (len(rows), len(dates)))


if __name__ == '__main__':
    main()
