-- ============ the review destination — Automation 05, step 5 ============
--
-- Where a review request sends somebody, and whether the agency is running it
-- at all. Two columns on `clients`, and the interesting part of both is what
-- they deliberately are NOT.

alter table public.clients
  add column if not exists review_link text,
  add column if not exists review_requests_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- THE LINK IS A POLICY BOUNDARY, NOT A FORMAT CHECK
-- ---------------------------------------------------------------------------
-- §8.B of the Enquadramento is GOOGLE'S policy: no screening by sentiment, no
-- incentives, no asking for a colleague to be named, no volume spikes. The
-- whole of Automation 05 is shaped by it.
--
-- A link to another platform would run the same automation under rules nobody
-- has read. That is not a smaller version of the same thing — it is an
-- unanalysed jurisdiction, and §8.A.3 already says what we do with those.
--
-- So the host is an ALLOW-LIST and a new destination is a migration, which puts
-- the analysis in front of the person adding it.
--
-- ⚠️ THE PATH IS DELIBERATELY UNCONSTRAINED, and that is not laziness. Google
-- issues review links in more than one shape and has changed them before; a
-- pattern tight enough to be satisfying would reject a valid link an agency
-- pasted from their own dashboard, and the failure would look like our bug in
-- front of a client. Deny by default where we know the list — the hosts — and
-- do not pretend to know the part we do not.
alter table public.clients
  drop constraint if exists clients_review_link_is_google;

alter table public.clients
  add constraint clients_review_link_is_google check (
    review_link is null or review_link ~ '^https://(g\.page|search\.google\.com|maps\.google\.com|www\.google\.com|maps\.app\.goo\.gl)/'
  );

comment on column public.clients.review_link is
  'Google Business Profile review link. NULL means Automation 05 does not run '
  'for this agency — an agency with no public profile has nowhere to send '
  'anybody, and that is a refusal with a reason rather than a degraded mode.';

-- ---------------------------------------------------------------------------
-- 🔴 AN AGENCY MAY SWITCH 05 OFF ENTIRELY. THERE IS NO PER-SALE EQUIVALENT,
--    AND ITS ABSENCE IS THE POINT.
-- ---------------------------------------------------------------------------
-- Whole-agency is legitimate: they stop using the feature, every close records
-- `agency_disabled`, and the record shows a policy rather than a pattern.
--
-- Per-sale is REVIEW GATING WITH EXTRA STEPS. §8.B: pedir a todos é permitido;
-- escolher a quem pedir não é. A skip control in the cockpit would be the
-- offence with an audit trail showing who committed it, which is worse than
-- the offence alone.
--
-- So there is no `closes.skip`, no `closes.excluded_reason`, no nullable
-- `ask_after` somebody could set to infinity. Not "requires a justification" —
-- ABSENT, so there is no field for somebody to fill in convincingly.
--
-- This is the one place in the system where the tempting act is the KIND one:
-- sparing the client who had a difficult sale is what a decent person would do
-- by hand. `review-disposition.test.ts` asserts the exact key set of a close,
-- so a flag added here fails a test rather than shipping.

comment on column public.clients.review_requests_enabled is
  'Whole-agency switch for Automation 05. There is deliberately no per-sale '
  'equivalent: choosing who to ask is the offence the automation exists to '
  'make impossible.';

-- ---------------------------------------------------------------------------
-- VERIFICATION — run these, do not assume them
-- ---------------------------------------------------------------------------
--   -- a Google link is accepted, in both of the shapes agencies actually paste
--   update clients set review_link = 'https://g.page/r/CXyzAbC123/review'
--     where id = '<a test client>';                                    -- ok
--   update clients set review_link =
--     'https://search.google.com/local/writereview?placeid=ChIJxyz';   -- ok
--
--   -- another platform is refused, which is the whole point of the constraint
--   update clients set review_link = 'https://facebook.com/x/reviews';
--   -- expect: violates "clients_review_link_is_google"
--
--   -- and so is a lookalike host, because the anchor is at the start
--   update clients set review_link = 'https://evil.com/g.page/r/x/review';
--   -- expect: the same refusal
--
--   -- http is refused too: a review link is a public URL and there is no
--   -- reason for one we hand to a client to be unencrypted
--   update clients set review_link = 'http://g.page/r/x/review';
--   -- expect: the same refusal
--
--   -- null is permitted, and means the automation does not run
--   update clients set review_link = null;                             -- ok
--
--   -- the switch defaults to on, and only matters once a link exists
--   select review_requests_enabled from clients limit 5;  -- expect: all true
--
--   -- there is no per-sale column, and this is the assertion that says so
--   select column_name from information_schema.columns
--    where table_name = 'closes'
--      and column_name ~ 'skip|exclud|disabl|opt_out';   -- expect: 0 rows
--
-- Restore review_link to whatever it was afterwards.
