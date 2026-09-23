import { FrameSkeleton } from '@/components/FrameSkeleton'

/**
 * 🔴 THIS FILE RENDERED THE OLD COCKPIT until 23 Sep 2026.
 *
 * It drew SkeletonShell — the retired chrome, with the Queue / Leads / Report
 * tab bar — and a five-step wizard ("Agency · Voice · Booking · Escalation ·
 * Review") that the rebuilt onboarding does not have. The root layout renders
 * nothing but <body>, so this boundary covers the WHOLE viewport: every
 * navigation into /onboarding or /onboarding/new flashed the old dashboard
 * before the new screen arrived, and that flash is why the cockpit read as
 * half-migrated.
 *
 * 🔒 It is replaced rather than deleted: tests/probe-timing.ts asserts that a
 * streaming boundary exists here, and it is right to — /onboarding reads the
 * clients, their records and their contracts before it can draw.
 */
export default function Loading() {
  return <FrameSkeleton current="onboarding" />
}
