-- Proof for 0051. Run in the Supabase SQL editor AFTER applying 0051.
-- Expected: 1-4 PASS at once; 5 PASS once the health check has run after 0051
-- (<= 10 minutes). Before 0051: 1-5 FAIL.
-- Read-only: no fixture is written.

create temp table v0051 (n int primary key, verdict text, reason text);

do $$ begin
  insert into v0051 select 1,
    case when count(*) = 1 then 'PASS' else 'FAIL' end,
    case when count(*) = 1 then 'the column exists' else 'no n8n_api_key_exp column on health_runs' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'health_runs' and column_name = 'n8n_api_key_exp';
exception when others then insert into v0051 values (1, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

do $$ declare t text; begin
  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'health_runs' and column_name = 'n8n_api_key_exp';
  insert into v0051 values (2,
    case when t = 'timestamp with time zone' then 'PASS' else 'FAIL' end,
    'type is ' || coalesce(t, '(missing)') || ', expected timestamp with time zone');
exception when others then insert into v0051 values (2, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

do $$ declare nl text; begin
  select is_nullable into nl from information_schema.columns
   where table_schema = 'public' and table_name = 'health_runs' and column_name = 'n8n_api_key_exp';
  insert into v0051 values (3,
    case when nl = 'YES' then 'PASS' else 'FAIL' end,
    'nullable = ' || coalesce(nl, '(missing)') || '; older rows and an unreadable key must stay null, never a guess');
exception when others then insert into v0051 values (3, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

do $$ declare ok boolean; begin
  ok := has_column_privilege('service_role', 'public.health_runs', 'n8n_api_key_exp', 'INSERT');
  insert into v0051 values (4,
    case when ok then 'PASS' else 'FAIL' end,
    case when ok then 'service_role (healthcheck.sh) can write it' else 'service_role cannot INSERT the column' end);
exception when others then insert into v0051 values (4, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

do $$ declare r record; begin
  execute 'select ran_at, n8n_api_key_exp from public.health_runs order by ran_at desc limit 1' into r;
  insert into v0051 values (5,
    case when r.n8n_api_key_exp is not null then 'PASS' else 'FAIL' end,
    case when r.n8n_api_key_exp is not null
         then 'newest run (' || r.ran_at || ') publishes the key expiry: ' || r.n8n_api_key_exp
         else 'newest run (' || coalesce(r.ran_at::text, 'none') || ') has no value yet; wait for the next health check' end);
exception when others then insert into v0051 values (5, 'FAIL', 'the case itself errored: ' || sqlerrm);
end $$;

-- ══ THE VERDICT — the only output that matters ════════════════════════════
select c.n as "case", c.what,
       coalesce(r.verdict, 'FAIL') as verdict,
       coalesce(r.reason, 'DID NOT RUN — a missing row is a failure') as reason
  from (values
    (1, 'n8n_api_key_exp exists on health_runs'),
    (2, 'it is timestamptz'),
    (3, 'it is nullable'),
    (4, 'service_role can insert it'),
    (5, 'the newest health run carries a value')
  ) as c(n, what)
  left join v0051 r using (n)
 order by c.n;
