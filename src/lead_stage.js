// ============================================================================
// What stage is this lead in now? — shared source.
//
// Embedded verbatim into MergeLeadFields. Unit-tested standalone in
// tests/lead_stage.test.js, which loads THIS file rather than a copy.
//
// WHY THIS EXISTS
// On 2026-09-11 a lead sat at viewing_booked for an hour while being asked
// for a budget. The booking behind the stage had died on 5 September; nothing
// had looked at it since, and the no-backwards rule kept the stage where the
// dead booking had left it. The booking half was fixed by ResolveBooking
// (src/booking_check.js). This is the stage half: on 2026-09-12 four bookings
// were retired in one night and the stage never moved.
//
// THE RULE
// Stage tracks what the WORKFLOW holds, not what the model proposes:
//   - forward along new -> contacted -> qualified -> viewing_booked, on the
//     model's proposal, never backwards on a proposal alone (Gate B2: the
//     model returns null and "contacted" for a message about parking);
//   - viewing_booked is entered ONLY when an event was created this turn, and
//     LEFT when the booking is retired -- the lead is then what they were
//     before the booking: qualified. An un-booked lead is not a booked one;
//   - nurturing is applied below qualified and recorded, not applied, at or
//     above it. A qualified lead is not demoted on one quiet message;
//   - lost is derived from the lead's own words -- the model's intent field
//     saying not_interested -- and from nothing else. The spec's stage enum
//     never contained it, so the model cannot propose it. It is entered from
//     anywhere and left the moment the lead engages again: a false 'lost'
//     costs one message, a lead stuck in 'lost' costs the lead. A revived
//     lead lands where the row's facts put them (budget + timeline + area =
//     qualified), because the facts did not leave when the lead did.
//
// Every decision is returned as a signal so the trail is on the row.
// ============================================================================

const STAGE_RANK = { lost: -1, new: 0, nurturing: 1, contacted: 1, qualified: 2, viewing_booked: 3 };

// nextStage(input) -> { stage, signals, kept, becameQualified }
//
//   input.before        the stored stage (null reads as 'new')
//   input.proposed      the model's stage, already stripped of anything the
//                       caller refuses (viewing_booked without an event)
//   input.intent        the model's intent: 'not_interested' derives lost
//   input.wantsBooking  the model's wants_booking -- a lead asking for a time
//                       is not lost whatever else they said
//   input.booked        an event was CREATED this turn
//   input.retired       the booking retired this turn ({retired_reason}), or null
//   input.factsQualified the merged row holds a budget, a timeline and an area:
//                       what a revived lead is judged by
//   input.at            ISO timestamp for the signals (injected for tests)
//
//   stage            what to store
//   signals          entries to append to qualification.stage_signals
//   kept             a note for the run log when a proposal was refused, else null
//   becameQualified  true only on a genuine entry into qualified -- a
//                    regression from viewing_booked is not one
function nextStage(input) {
  const inp = input || {};
  const before = inp.before || 'new';
  const at = inp.at || new Date().toISOString();
  const rank = (s) => (STAGE_RANK[s] === undefined ? 0 : STAGE_RANK[s]);
  const signals = [];
  let kept = null;
  let stage = before;

  // 1. The booking behind viewing_booked is gone: the lead is un-booked.
  //    Any other stage was never the booking's to begin with.
  if (inp.retired && before === 'viewing_booked') {
    stage = 'qualified';
    signals.push({ regressed: 'viewing_booked -> qualified',
                   reason: 'booking retired: ' + (inp.retired.retired_reason || 'unknown'), at });
  }

  // 2. What is being proposed this turn. The workflow's own facts outrank the
  //    model: an event created wins over everything, then the lead's words.
  let proposed = inp.proposed || null;
  if (inp.intent === 'not_interested' && !inp.wantsBooking) proposed = 'lost';
  if (inp.booked) proposed = 'viewing_booked';

  if (stage === 'lost' && proposed !== 'lost') {
    // The lead wrote back and did not withdraw again: that alone revives them,
    // whether or not the model proposed a stage.
      // The lead came back. What they are now is what the ROW supports, not
      // what a model seeing twenty messages guesses: the facts survived the
      // withdrawal, so a lead with budget, timeline and area is qualified.
      const revived = proposed === 'viewing_booked' ? 'viewing_booked'
                    : (inp.factsQualified ? 'qualified' : 'contacted');
      signals.push({ revived, from: 'lost', at,
                     basis: proposed === 'viewing_booked' ? 'event created this turn'
                          : (inp.factsQualified ? 'budget, timeline and area on the row'
                                                : 'row lacks budget, timeline or area') });
      stage = revived;
  } else if (proposed && proposed !== stage) {
    if (proposed === 'lost') {
      signals.push({ signal: 'lost', from: stage, at });
      stage = 'lost';
    } else if (proposed === 'nurturing') {
      if (rank(stage) >= STAGE_RANK.qualified) {
        signals.push({ signal: 'nurturing', suppressed_from: stage, at });
        kept = 'stage=' + stage + ' (nurturing signal recorded, not applied)';
      } else {
        stage = 'nurturing';
      }
    } else if (rank(proposed) > rank(stage)) {
      stage = proposed;
    } else {
      kept = 'stage=' + stage + ' (model proposed ' + proposed + ', a regression)';
    }
  }

  const becameQualified = stage === 'qualified' && rank(before) < STAGE_RANK.qualified;
  return { stage, signals, kept, becameQualified };
}
