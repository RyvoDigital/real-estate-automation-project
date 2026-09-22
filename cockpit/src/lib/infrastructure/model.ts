import { HEALTH_STALE_MINUTES } from '@/lib/data'
import type { MonitorLine, MonitorSeen } from './monitor'

/**
 * Infrastructure (brief §2.4, Q4): is the system alive, and is the thing that
 * watches it alive? Moved here from /health on 22 Sep 2026, rebuilt on the
 * Frame. A pure core: the last health run in, the screen's states out.
 *
 *   🔒 THE LAST-RUN STAMP IS THE WHOLE SCREEN. Nobody opens this to discover a
 *      fault — Better Stack emails first. They open it to confirm one. So the
 *      stamp is the biggest thing on it, absolute time beside relative.
 *   🔒 S8 IS LOUDER THAN THE CHECKS. A run older than HEALTH_STALE_MINUTES is
 *      not "still green": it is a screen that has stopped being told anything.
 *   🔴 S4 IS NOT S1-WITH-EVERYTHING-RED. A read that failed and a run where
 *      every check failed are different facts and say different sentences.
 *   🔴 THE COUNT COMES FROM THE ROW. This screen said "Twelve checks" in words
 *      while the producer published thirteen (found 22 Sep 2026: the n8n key
 *      check was added on the 21st and no label moved). A count written in a
 *      sentence is a count that goes out of date silently, so the number is
 *      read from passed[] + failed[] and a test refuses a hardcoded one.
 *   🔴 THE SELF-REFERENCE. One check is "Supabase reachable", and health_runs
 *      lives in Supabase: when Supabase is down this screen cannot report it,
 *      it can only stop updating. The screen says so in words, so a stale stamp
 *      during an outage reads as the design rather than as a broken page.
 */

export type HealthRun = {
  ranAt: string
  ok: boolean
  passed: string[]
  failed: string[]
  durationMs: number | null
  host: string | null
}

export type InfrastructureInputs = {
  /** the most recent health_runs row; null = no run has ever published */
  run: HealthRun | null
  /** 🔴 the read itself failed: a different fact from "never run" */
  failure: string | null
  monitor: MonitorLine
  now: Date
}

/** S1 green · S8 stale · S2 never · S4 the read failed · plus "failing" */
export type InfrastructureStanding = 'green' | 'failing' | 'stale' | 'never' | 'readFailed'

export type Infrastructure = {
  standing: InfrastructureStanding
  /** 🔒 ALWAYS PRESENT, whatever the standing: the stamp is the screen */
  stamp: {
    ranAt: string | null
    ageMinutes: number | null
    absolute: string | null
    relative: string | null
    renderedAt: string
    staleAfterMinutes: number
    durationMs: number | null
    host: string | null
  }
  checks: { passed: string[]; failed: string[]; total: number }
  monitor: MonitorSummary
  /** the sentence the standing is owed, in the screen's own words */
  says: string
}

export type MonitorSummary =
  | { asked: false; why: string; askedAt: string; says: string }
  | { asked: true; askedAt: string; monitors: MonitorSeen[]; allUp: boolean; watching: number; says: string }

const LISBON = 'Europe/Lisbon'
export const absoluteTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: LISBON })

const relative = (min: number) => (min === 0 ? 'less than a minute ago' : `${min} minute${min === 1 ? '' : 's'} ago`)

/**
 * 🔴 S3. Every not-asked reason gets the SAME shape of sentence: we could not
 * ask. None of them may read as "nothing is wrong".
 */
function summariseMonitor(m: MonitorLine): MonitorSummary {
  if (!m.asked) {
    return { asked: false, why: m.why, askedAt: m.askedAt, says: `We could not ask the monitor, so this says nothing about whether it is watching. ${m.why}` }
  }
  const watching = m.monitors.length
  if (watching === 0) {
    // Asked, answered, and watching nothing: also not a clean bill.
    return { asked: true, askedAt: m.askedAt, monitors: [], allUp: false, watching: 0, says: 'Better Stack answered and has no monitors configured, so nothing outside this box is watching.' }
  }
  const down = m.monitors.filter((x) => x.status === 'down' || x.status === 'validating')
  const idle = m.monitors.filter((x) => x.status === 'paused' || x.status === 'pending' || x.status === 'maintenance' || x.status === 'unknown')
  const allUp = down.length === 0 && idle.length === 0
  const says = allUp
    ? `Better Stack is watching ${watching} monitor${watching === 1 ? '' : 's'}, all up.`
    : `Better Stack is watching ${watching} monitor${watching === 1 ? '' : 's'}: ${[
        down.length ? `${down.length} down` : null,
        idle.length ? `${idle.length} not checking (${idle.map((x) => x.status).join(', ')})` : null,
      ].filter(Boolean).join(', ')}.`
  return { asked: true, askedAt: m.askedAt, monitors: m.monitors, allUp, watching, says }
}

export function buildInfrastructure(i: InfrastructureInputs): Infrastructure {
  const monitor = summariseMonitor(i.monitor)
  const renderedAt = i.now.toISOString()
  const base = { renderedAt, staleAfterMinutes: HEALTH_STALE_MINUTES }

  // 🔴 S4 first: a failed read is not a run, and it is not "never".
  if (i.failure !== null) {
    return {
      standing: 'readFailed',
      stamp: { ranAt: null, ageMinutes: null, absolute: null, relative: null, durationMs: null, host: null, ...base },
      checks: { passed: [], failed: [], total: 0 },
      monitor,
      says: `The last health run could not be read, so this screen knows nothing about the checks — which is not the same as the checks failing. ${i.failure}`,
    }
  }
  if (!i.run) {
    return {
      standing: 'never',
      stamp: { ranAt: null, ageMinutes: null, absolute: null, relative: null, durationMs: null, host: null, ...base },
      checks: { passed: [], failed: [], total: 0 },
      monitor,
      says: 'The check has never published. This screen has no data at all.',
    }
  }

  const ageMinutes = Math.floor((i.now.getTime() - Date.parse(i.run.ranAt)) / 60_000)
  const stale = ageMinutes >= HEALTH_STALE_MINUTES
  const checks = { passed: i.run.passed, failed: i.run.failed, total: i.run.passed.length + i.run.failed.length }
  const stamp = {
    ranAt: i.run.ranAt, ageMinutes, absolute: absoluteTime(i.run.ranAt), relative: relative(ageMinutes),
    durationMs: i.run.durationMs, host: i.run.host, ...base,
  }
  // 🔒 Stale wins over the checks, however green they are: they are not current.
  if (stale) {
    return { standing: 'stale', stamp, checks, monitor,
      says: `No result for ${ageMinutes} minutes. The check runs every 10, so this screen is not telling you the system is fine — it is telling you nothing.` }
  }
  if (checks.failed.length > 0) {
    return { standing: 'failing', stamp, checks, monitor,
      says: `${checks.failed.length} of ${checks.total} check${checks.total === 1 ? '' : 's'} failing.` }
  }
  return { standing: 'green', stamp, checks, monitor,
    says: `${checks.passed.length} of ${checks.total} check${checks.total === 1 ? '' : 's'} passing.` }
}
