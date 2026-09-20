-- ====== READ-ONLY. Emits the DDL the repository is missing. ======
--
-- 🔴 THIS WRITES NOTHING. Every statement is a SELECT against the catalogue.
-- Paste it into the SQL editor, copy ALL of the output, and hand it back — it
-- becomes db/migrations/0045_the_month_tables_baseline.sql.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS RATHER THAN ME WRITING THE BASELINE
-- ---------------------------------------------------------------------------
-- PostgREST's OpenAPI description gives columns, types, nullability, comments
-- and the primary/foreign key hints. It does NOT give:
--
--   check constraints · triggers · indexes · grants · defaults on some types
--
-- So a baseline reconstructed from what I can see would be a file that CLAIMS
-- to reproduce the database and quietly omits its constraints — a schema that
-- looks complete and enforces nothing. That is worse than no baseline: a
-- rebuild from it would produce tables that accept rows the real ones refuse,
-- and the difference would surface as bad data rather than as an error.
--
-- 🔒 So the DDL comes from the database, which is the only thing that knows it.
--
-- (If `pg_dump --schema-only -t public.client_contracts -t public.payments
--  -t public.costs -t public.cost_checks -t public.web_clients` is available,
--  that output is better than this and should be used instead. This exists for
--  the case where only a SQL console is.)

\echo '════════ 1. COLUMNS ════════'
select table_name, ordinal_position, column_name, data_type,
       character_maximum_length, numeric_precision, numeric_scale,
       is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('client_contracts','payments','costs','cost_checks','web_clients')
 order by table_name, ordinal_position;

\echo '════════ 2. CONSTRAINTS — checks, uniques, FKs, PKs ════════'
-- pg_get_constraintdef gives the exact text, which is what a baseline needs.
select conrelid::regclass::text as table_name,
       conname,
       case contype when 'c' then 'check' when 'f' then 'foreign key'
                    when 'p' then 'primary key' when 'u' then 'unique'
                    else contype::text end as kind,
       pg_get_constraintdef(oid) as definition
  from pg_constraint
 where connamespace = 'public'::regnamespace
   and conrelid::regclass::text in ('client_contracts','payments','costs','cost_checks','web_clients')
 order by conrelid::regclass::text, contype, conname;

\echo '════════ 3. INDEXES ════════'
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('client_contracts','payments','costs','cost_checks','web_clients')
 order by tablename, indexname;

\echo '════════ 4. TRIGGERS, and the functions behind them ════════'
select c.relname as table_name, t.tgname,
       pg_get_triggerdef(t.oid) as definition
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal
   and c.relnamespace = 'public'::regnamespace
   and c.relname in ('client_contracts','payments','costs','cost_checks','web_clients')
 order by c.relname, t.tgname;

select p.proname, pg_get_functiondef(p.oid) as definition
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname like any (array['%contract%','%payment%','%cost%','%web_client%'])
 order by p.proname;

\echo '════════ 5. GRANTS — which is how a freeze is half-implemented ════════'
-- 🔒 0042 revokes update/delete/truncate from service_role. A baseline that
-- rebuilt the tables and the triggers but not the grants would restore a
-- weaker guarantee than the one in force, and nothing would say so.
select table_name, grantee, privilege_type
  from information_schema.table_privileges
 where table_schema = 'public'
   and table_name in ('client_contracts','payments','costs','cost_checks','web_clients')
 order by table_name, grantee, privilege_type;

\echo '════════ 6. VIEWS ════════'
select table_name, view_definition
  from information_schema.views
 where table_schema = 'public'
   and table_name in ('client_contracts_uncorrected','client_contracts_current');

\echo '════════ 7. COMMENTS ════════'
select c.relname as object, a.attname as column_name, d.description
  from pg_description d
  join pg_class c on c.oid = d.objoid
  left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
 where c.relnamespace = 'public'::regnamespace
   and c.relname in ('client_contracts','payments','costs','cost_checks','web_clients','client_contracts_uncorrected')
 order by c.relname, a.attnum;
