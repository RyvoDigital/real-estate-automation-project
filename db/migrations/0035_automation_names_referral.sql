-- ============ correcting what two automations SAY THEY ARE ============
--
-- 19 September 2026. Same defect as 0027, same reasoning, different column:
-- `automations.name` has held these since 0001 and both are now false.
--
--   db_reactivation   'Database Reactivation & Referral Engine'
--   reputation_loop   'Post-Close Reputation & Referral Loop'
--
-- WHY THIS IS URGENT RATHER THAN TIDY
--
-- "Referral" appears in two of five automation names and is built in NEITHER.
-- A word that appears twice and exists nowhere is a word, not a mechanism.
-- Worse, it is not merely unbuilt — it is REFUSED, and refused for a reason
-- that is recorded in the rejected table:
--
--   a referred contact has no documented origin, which is segment D, and
--   segment D is what the gate exists to refuse.
--
-- So a referral loop built honestly terminates in a screen saying "we cannot
-- message this person", and built dishonestly it is the Idealista row with
-- better manners. See docs/automation-05-review-request-design.md §1.2.
--
-- Nothing reads either column today — every query in cockpit/src selects
-- `key` or `id` — and that is exactly the argument for correcting them NOW.
-- The cockpit redesign's Clients screen (improvements §3.17, and
-- docs/cockpit-design-brief.md §2.2) answers "which automations is this client
-- running", and `automations.name` is the obvious column for it to read. The
-- first reader of a stale row would put a product we explicitly refused to
-- sell on a screen the operator shows to an agency.
--
-- 0027 put it better than this comment can: "A stale one is not untidiness --
-- it is how the wrong thing gets built two years from now by somebody who
-- trusted the row. The cheapest moment to correct it is before anyone has."
--
-- THE NEW NAMES ARE NOT INVENTED HERE. Both are the titles their own design
-- documents already carry:
--
--   docs/automation-02-specification.md        "Automation 02 -- Database Reactivation"
--   docs/automation-05-review-request-design.md "Automation 05 -- Post-Close Review Request"
--
-- WHAT IS DELIBERATELY NOT CHANGED
--
--   leads.source            The comment in 0001 lists 'referral' among a lead's
--                           possible origins. LEAVE IT. A lead who arrives
--                           saying somebody sent them is a real and lawful
--                           event -- they messaged us, inbound, on their own
--                           initiative. What is refused is the automation that
--                           would take a name from a client and message a
--                           stranger. Those are opposite directions of travel
--                           and only the second one is the rejected product.
--                           Deleting the value would lose an origin the gate
--                           correctly classifies.
--
--   lead_nurture            'Lead Nurture & Listing-Match Drip' is ALSO stale
--                           -- "Drip" names a send (F5) that is not built and
--                           has no audience until the declaration happens --
--                           but the honest replacement depends on which tier
--                           the client is on. For an agency with no structured
--                           data the product is agent triage, not matching, and
--                           selling it as matching is the rejected row.
--                           docs/automation-03-no-crm-design.md has not settled
--                           a single name, so this migration does not invent
--                           one. Open question, deliberately left open.

begin;

-- ---------------------------------------------------------------------------
-- 1. Automation 02
-- ---------------------------------------------------------------------------
update public.automations
   set name        = 'Database Reactivation',
       description = 'Reactivates an agency''s existing contacts under a '
                     'documented lawful basis, and refuses every contact '
                     'without one.'
 where key = 'db_reactivation';

-- ---------------------------------------------------------------------------
-- 2. Automation 05
-- ---------------------------------------------------------------------------
-- The old name carried FOUR acts with four audiences. Only one is this
-- automation; the other three are elsewhere or refused (design §1):
--   public review   -> this
--   stay in touch   -> already built, it is 02's segment A template
--   referral        -> refused, as above
--   testimonial     -> a permission, not a message. Named, out of scope.
update public.automations
   set name        = 'Post-Close Review Request',
       description = 'Asks every party to a closed sale for a public review, '
                     'without choosing whom to ask, and records every sale it '
                     'may not ask about with the reason. One message, once.'
 where key = 'reputation_loop';

-- ---------------------------------------------------------------------------
-- 3. Automation 04 -- SEPARABLE. Drop this statement if you want only the
--    referral correction; the two above stand alone.
-- ---------------------------------------------------------------------------
-- Not a referral defect. It is an internal contradiction inside one row:
-- 0027 corrected this automation's DESCRIPTION to a publication gate and left
-- its NAME saying "Launch Engine", so the row now disagrees with itself. The
-- correct name is settled -- docs/automation-04-publication-gate-design.md is
-- titled "the publication gate" -- so this invents nothing either.
update public.automations
   set name = 'Publication Gate'
 where key = 'listing_launch';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select key, name, left(description, 60) as description
--     from public.automations
--    order by key;
--
-- Expect exactly five rows, and read ALL FIVE rather than the three touched --
-- a WHERE clause that matched more than intended is only visible next to the
-- rows it should have left alone (0027's own check, and lesson 7b: a
-- constraint is proved by the cases it must LEAVE ALONE).
--
--   key                  name
--   -------------------  ---------------------------
--   db_reactivation      Database Reactivation            <- changed
--   inbound_concierge    AI Inbound Concierge             <- UNCHANGED
--   lead_nurture         Lead Nurture & Listing-Match Drip <- UNCHANGED, see above
--   listing_launch       Publication Gate                 <- changed (separable)
--   reputation_loop      Post-Close Review Request        <- changed
--
-- And the property that motivated the migration, stated as a query:
--
--   select key, name, description
--     from public.automations
--    where name ilike '%referral%' or description ilike '%referral%';
--   -- expect ZERO rows.
--
-- The 02 description deliberately does NOT deny a referral mechanism, though
-- an earlier draft of this migration did. A description that defends itself
-- against the name it replaced carries the ghost of that name, AND it makes
-- this check return a row on success -- a check that cannot fail for the
-- reason it exists (lesson 1n). The refusal and its reasoning live in this
-- file's header and in the design document, which is where a reader looking
-- for "why is there no referral automation" will actually look. The column
-- says what the automation IS.
