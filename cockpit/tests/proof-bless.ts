/*
 * Record that an out-of-suite proof has been run. `npm run proof:bless`.
 *
 * Run the proof FIRST. This writes down that you did; it cannot check.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const REPO = resolve(new URL('../..', import.meta.url).pathname)
const BOOK = resolve(REPO, 'db/tests/proofs.json')
const book = JSON.parse(readFileSync(BOOK, 'utf8')) as {
  proofs: {
    id: string
    watches: string[]
    hashes: Record<string, string>
    last_proved: string | null
    proved_by: string | null
    blocked?: { reason: string; runnable_when: string }
    /**
     * 🔴 CODE THAT MUST BE LIVE BEFORE THE MIGRATION IS APPLIED.
     *
     * `blocked.runnable_when` answers "can this proof be run yet". This answers
     * a different and harder question: "was the deploy done BEFORE the schema
     * change". Those come apart — the file can exist locally, be committed, be
     * pushed, and still not be serving.
     *
     * 0036's lesson, got wrong twice: the code deploy is a PRECONDITION of the
     * migration, not a companion to it. Both times the ordering held anyway,
     * and both times the step skipped was the one that would have caught it.
     * A rule that is remembered correctly twice and applied wrongly twice is
     * not a rule, it is a habit.
     */
    deploy_precondition?: {
      /** The repo path that must be live. */
      path: string
      /**
       * The production alias, so the script can ASK what is serving instead of
       * taking somebody's word for it.
       *
       * Absent means it cannot check, and it says so rather than implying it
       * did — §0.4-10: a figure derived over nothing says what was examined.
       */
      alias?: string
      /** What breaks if the migration lands first, in one line. */
      breaks: string
      /**
       * Filled by --deployed. Whose claim it is, and which commit they saw.
       * Recorded rather than inferred: this script cannot see Vercel, so the
       * honest thing is to make somebody STATE what they observed and then
       * check the statement for consistency.
       */
      attested?: {
        sha: string
        by: string
        at: string
        /** What the alias was actually serving when this was blessed, if askable. */
        live_sha?: string
        /**
         * 🔴 Whether the claim was CHECKED against the live deployment, or only
         * stated. Recorded either way: an attestation that could not be
         * verified is worth having, and worth being able to tell apart from
         * one that was.
         */
        verified: boolean
      }
    }
  }[]
}
const only = process.argv[2]
const deployedArg = process.argv.find((a) => a.startsWith('--deployed='))?.slice('--deployed='.length)

/**
 * An id, or an explicit --all. Never a bare `npm run proof:bless`.
 *
 * The first version blessed every proof when called with no argument, which is
 * the dangerous default: if one proof's file had changed and had NOT been
 * re-run, a blanket bless would have silently recorded it as proved — the exact
 * failure this whole mechanism exists to prevent, performed by the mechanism.
 *
 * Blessing is a claim that a human ran something. A claim made about four
 * things when one was intended is three lies, and the shortest command should
 * not be the one that tells them.
 */
if (!only) {
  console.error(
    'proof:bless needs an id, or --all if you really did run them all.\n\n' +
    'Available:\n' +
    (JSON.parse(readFileSync(BOOK, 'utf8')).proofs as { id: string }[])
      .map((p) => `  ${p.id}`).join('\n') +
    '\n\n  npm run proof:bless 0018-campaign-runs-constraints\n' +
    '\n"All of them" is almost never true: blessing a proof you did not run is\n' +
    'lying to the next person, who will be you.',
  )
  process.exit(2)
}


/**
 * 🔴 THE LOCAL CALENDAR DAY, NOT UTC.
 *
 * `new Date().toISOString().slice(0, 10)` was recording 2026-09-20 for a proof
 * run at 01:07 on the 21st, because Lisbon in summer is UTC+1 and CEST is
 * UTC+2 — so every proof blessed between midnight and 02:00 local was dated a
 * day early.
 *
 * Which is precisely when this project's sessions happen, and precisely the
 * kind of record it exists to be trusted: `last_proved` answers "when did
 * somebody see this fire", and a date that is silently a day behind makes the
 * staleness comparison wrong in the direction that looks fine.
 *
 * 🔒 Europe/Lisbon rather than the machine's zone, because the proof book is
 * the project's record and the project has one clock — the same zone `Clock`,
 * `anomalyClock` and the frame's footer already use. A laptop carried to
 * another country must not start dating the evidence differently.
 */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
}

let who = 'unknown'
try { who = execSync('git config user.name', { encoding: 'utf8' }).trim() } catch {}

/**
 * An unknown id is an ERROR, not a no-op.
 *
 * The first version filtered on the id and blessed whatever matched — so a typo
 * matched nothing, printed nothing, and exited zero. It silently did nothing
 * while looking exactly like a successful run, which is §5c performed BY THE
 * TOOL BUILT TO PREVENT IT: the operator believed a proof was blessed, the
 * staleness alarm stayed red, and the two facts would have been reconciled by
 * someone eventually distrusting the alarm.
 *
 * Caught by an operator typing `0020-message-templates` instead of
 * `0020-templates-and-sends-fk`.
 */
const ids = (book.proofs as { id: string }[]).map((p) => p.id)
if (only !== '--all' && !ids.includes(only)) {
  console.error(
    `proof:bless: no proof with id "${only}".\n\nThe ids that exist:\n` +
    ids.map((i) => `  ${i}`).join('\n') +
    '\n\nNothing was blessed. A typo that blesses nothing and exits zero is how a\n' +
    'proof stays unrun while everybody believes it was run.',
  )
  process.exit(2)
}

/**
 * A BLOCKED proof cannot have been run, so it cannot be blessed.
 *
 * Its whole point is that the thing it tests does not exist yet. Blessing it
 * would stamp a date and a name on a proof nobody could have performed, and
 * `--all` would do it by accident to every blocked entry at once — which is the
 * same class of mistake the no-bare-bless rule above exists to prevent.
 *
 * When the blocker really has arrived, the staleness suite says so by name, and
 * the honest sequence is: run it, remove `blocked`, then bless.
 */
let blessed = 0
for (const p of book.proofs) {
  if (only !== '--all' && p.id !== only) continue
  /*
   * ── the deploy precondition ───────────────────────────────────────────────
   *
   * Refuses unless somebody names the commit they saw serving. Then it checks
   * that claim against git, which catches the two ways it goes wrong without
   * anybody lying: a sha that does not contain the required file, and a sha
   * that was never pushed.
   */
  if (p.deploy_precondition && !p.deploy_precondition.attested) {
    const { path: needs, breaks } = p.deploy_precondition

    if (!deployedArg) {
      console.error(
        `\n🔴 ${p.id} has a DEPLOY PRECONDITION and no --deployed=<sha>.\n\n` +
          `  must be live first:  ${needs}\n` +
          `  if the migration lands first:  ${breaks}\n\n` +
          '  Open the running cockpit, confirm the behaviour is actually there,\n' +
          '  and pass the commit you saw serving:\n\n' +
          `      npm run proof:bless ${p.id} -- --deployed=<sha>\n\n` +
          '  This is 0036\'s lesson. It has been got wrong twice, and both times\n' +
          '  the skipped check was the one that would have caught it — so the\n' +
          '  bless refuses rather than reminding.',
      )
      process.exit(3)
    }

    /*
     * ── what is actually serving ─────────────────────────────────────────────
     *
     * `vercel inspect <alias>` resolves the alias to the deployment serving it;
     * `vercel ls --json` carries that deployment's githubCommitSha. Two calls,
     * no token handling here — the CLI is already authenticated as whoever is
     * running this.
     *
     * 🔴 It returns null rather than guessing. Offline, logged out, or a CLI
     * that has changed its output are all "cannot check", and none of them is
     * "the deploy is fine".
     */
    const liveSha = (): string | null => {
      if (!p.deploy_precondition?.alias) return null
      try {
        const alias = p.deploy_precondition.alias
        const inspected = execSync(`npx vercel inspect ${JSON.stringify(alias)} 2>&1`, {
          encoding: 'utf8', cwd: REPO, timeout: 60_000,
        })
        /*
         * 🔴 THE NEWEST BUILD AND THE SERVING BUILD ARE TWO DIFFERENT FACTS,
         * and only the second answers "what is live". A rolled-back deploy
         * leaves a newer build sitting there, Ready, serving nobody.
         *
         * So the alias is resolved, never the top of the list. And the host is
         * picked by CROSS-CHECKING against the deployment list rather than by
         * position in the output: `vercel inspect` prints the deployment url
         * above the Aliases block today, but an ordering assumption is not a
         * fact, and `ryvo-cockpit.vercel.app` matches a naive "has a hyphen"
         * test just as well as the deployment host does.
         */
        const listed = execSync('npx vercel ls ryvo-cockpit --json 2>/dev/null', {
          encoding: 'utf8', cwd: REPO, timeout: 60_000, maxBuffer: 20 * 1024 * 1024,
        })
        const deployments = (JSON.parse(listed) as { deployments: { url: string; meta?: Record<string, string> }[] })
          .deployments

        const candidates = (inspected.match(/https:\/\/([a-z0-9-]+\.vercel\.app)/g) ?? []).map((u) =>
          u.replace('https://', ''),
        )
        // The first candidate that IS a deployment. The alias is not one, so it
        // cannot be chosen however the output is ordered.
        const serving = candidates.map((h) => deployments.find((d) => d.url === h)).find(Boolean)
        return serving?.meta?.githubCommitSha ?? null
      } catch {
        return null
      }
    }

    let full = ''
    try {
      full = execSync(`git rev-parse ${JSON.stringify(deployedArg)}^{commit}`, { encoding: 'utf8', cwd: REPO }).trim()
    } catch {
      console.error(`\n🔴 ${deployedArg} is not a commit in this repository.`)
      process.exit(3)
    }

    // (a) Does that commit actually contain the thing that had to be live?
    try {
      execSync(`git cat-file -e ${full}:${JSON.stringify(needs).slice(1, -1)}`, { cwd: REPO, stdio: 'ignore' })
    } catch {
      console.error(
        `\n🔴 ${deployedArg.slice(0, 7)} does NOT contain ${needs}.\n\n` +
          '  That is the failure this exists to catch: a deploy that predates the\n' +
          '  code the migration depends on. Nothing has been blessed.',
      )
      process.exit(3)
    }

    // (b) Was it ever pushed? A local commit is not a deploy.
    try {
      execSync(`git merge-base --is-ancestor ${full} origin/main`, { cwd: REPO, stdio: 'ignore' })
    } catch {
      console.error(
        `\n🔴 ${deployedArg.slice(0, 7)} is not an ancestor of origin/main, so it was never pushed\n` +
          '  and Vercel cannot be serving it. Nothing has been blessed.',
      )
      process.exit(3)
    }

    /*
     * (c) And the one that turns a stated claim into a checked one: is the
     * commit you say you observed actually CONTAINED in what the alias is
     * serving right now?
     */
    const live = liveSha()
    if (live) {
      let contained = false
      try {
        execSync(`git merge-base --is-ancestor ${full} ${live}`, { cwd: REPO, stdio: 'ignore' })
        contained = true
      } catch {}
      if (!contained) {
        console.error(
          `\n🔴 ${deployedArg.slice(0, 7)} is NOT contained in what is serving.\n\n` +
            `  ${p.deploy_precondition.alias} is serving ${live.slice(0, 7)}\n` +
            `  you attested          ${full.slice(0, 7)}\n\n` +
            '  Either the deploy you saw has been rolled back, or the commit you\n' +
            '  named was never the one serving. Nothing has been blessed.',
        )
        process.exit(3)
      }
      console.log(`deploy CHECKED: ${p.deploy_precondition.alias} serves ${live.slice(0, 7)}, which contains ${full.slice(0, 7)}`)
    } else {
      console.warn(
        `\n⚠️  COULD NOT CHECK what ${p.deploy_precondition.alias ?? 'the site'} is serving.\n` +
          '   Recording your claim as UNVERIFIED. That is worth having and is\n' +
          '   worth being able to tell apart from a checked one — it is written\n' +
          '   into the book as verified: false.\n',
      )
    }

    p.deploy_precondition.attested = {
      sha: full,
      by: who,
      at: today(),
      ...(live ? { live_sha: live } : {}),
      verified: Boolean(live),
    }
    console.log(`deploy precondition attested: ${full.slice(0, 7)} contains ${needs}, by ${who}`)
  }

  if (p.blocked) {
    const msg =
      `${p.id} is BLOCKED and cannot be blessed.\n` +
      `  reason:        ${p.blocked.reason}\n` +
      `  runnable when: ${p.blocked.runnable_when}\n` +
      '  If that now exists: run the proof, delete the `blocked` entry, then bless.'
    if (only === '--all') { console.error(`skipped — ${msg}\n`); continue }
    console.error(`proof:bless: ${msg}`)
    process.exit(2)
  }
  /*
   * `--all` MUST NOT RE-STAMP A PROOF THAT HAS NOTHING TO RE-BLESS.
   *
   * Blessing writes today's date and your name. For a proof whose files have
   * not moved since it was last proved, there is nothing to record — and the
   * write REPLACES a true date with a newer one, so a convenience call quietly
   * destroys the history the book exists to keep.
   *
   * Done once, on 18 September 2026, by someone demonstrating the blocked-entry
   * guard: ten real dates became today's in a single command. Recovered from
   * git because the file was uncommitted. `proof:bless <id>` still re-stamps
   * deliberately, which is the case where saying "I ran it again today" is true.
   */
  if (only === '--all') {
    // A proof that has NEVER been blessed is somebody claiming they ran a new
    // thing for the first time. That claim is always made by id — it is never
    // a side effect of a convenience command.
    if (!p.last_proved) {
      console.error(
        `skipped — ${p.id} has never been proved. A first blessing is a claim ` +
        `about a NEW thing and must be made deliberately:\n    npm run proof:bless ${p.id}`,
      )
      continue
    }
    const unchanged = p.watches.every(
      (f) => p.hashes[f] === createHash('sha256')
        .update(readFileSync(resolve(REPO, f))).digest('hex'),
    )
    if (unchanged) {
      console.log(`unchanged — ${p.id} left as proved on ${p.last_proved} by ${p.proved_by}`)
      continue
    }
  }
  blessed += 1
  for (const f of p.watches) {
    p.hashes[f] = createHash('sha256').update(readFileSync(resolve(REPO, f))).digest('hex')
  }
  p.last_proved = today()
  p.proved_by = who
  console.log(`blessed ${p.id} (${p.watches.length} file(s)) — ${p.last_proved}, ${who}`)
}

if (blessed === 0) {
  console.error('proof:bless: nothing matched, which should be unreachable. Not writing.')
  process.exit(2)
}
writeFileSync(BOOK, JSON.stringify(book, null, 2) + '\n')
