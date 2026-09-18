-- ============ correcting what Automation 04 says it is ============
--
-- `automations.description` for `listing_launch` has said this since 0001:
--
--   "On a new mandate: listing copy, social, email blast and launch checklist"
--
-- Two of those four are wrong, and one of them is wrong in a way that would
-- cost an automation.
--
-- **The email blast to interested buyers is AUTOMATION 03**, and it is built:
-- F2 ingests the listing, F3 scores every lead against it, F4 tells the agent
-- who and why. A second automation claiming it is one job sold twice — a
-- pricing problem before it is an engineering one.
--
-- **The listing copy was re-scoped on 7 September 2026** after an honest look:
-- generating listing copy is a wrapper around something an agent can
-- increasingly get free from a chat window, and it gets easier for them every
-- month. The decision stands.
--
-- What is left is the part neither 03 nor a chat window does: **a property may
-- not be advertised publicly unless it is lawful to advertise it.** Since 2013
-- every sale or rental advertisement in Portugal must carry the energy rating,
-- and every piece of an agency's publicity must carry its AMI licence number.
-- Fines are €250–€3,741 and they land on the client.
--
-- WHY THIS IS A MIGRATION RATHER THAN A NOTE
--
-- A description is what somebody reads when they arrive and want to know what
-- an automation is for. A stale one is not untidiness — it is how the wrong
-- thing gets built two years from now by somebody who trusted the row. The
-- cheapest moment to correct it is before anyone has.
--
-- Nothing reads this column to make a decision; it is documentation that
-- happens to live in the database. That is exactly why it has to be true.

update public.automations
   set description = 'Publication gate: refuses to advertise a property without '
                     'its energy rating and the agency AMI licence, prepares the '
                     'piece, and re-checks it as certificates expire. Alerting '
                     'interested buyers is Automation 03.'
 where key = 'listing_launch';

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select key, description from public.automations where key = 'listing_launch';
--   -- expect the new text, and exactly one row
--
--   -- and the neighbour, so a WHERE clause that matched everything is visible:
--   select key, left(description, 40) from public.automations order by key;
--   -- expect the other four descriptions UNCHANGED
