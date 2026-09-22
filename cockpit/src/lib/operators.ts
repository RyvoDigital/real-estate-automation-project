/**
 * Who the operators are, by NAME (22 Sep 2026, /calibrate). Records keep the
 * operator's email: it is the session's identity and what `recorded_by`
 * holds. But an agency looks at /calibrate and /segmentation across a table,
 * and an email address is not a name to show them. So the name comes from here.
 *
 * 🔒 An email NOT in this list is never shown to an agency either: it reads as
 * the team (the screen's own words), because showing an unknown address is the
 * failure this file exists to prevent. Add a row when an operator is added to
 * COCKPIT_ALLOWED_EMAILS.
 */
const OPERATOR_NAMES: Record<string, string> = {
  'manuelvale@ryvodigital.com': 'Manuel Vale',
}

/** The operator's name, or null when this email is not a known operator. */
export function operatorName(email: string | null | undefined): string | null {
  return email ? OPERATOR_NAMES[email.trim().toLowerCase()] ?? null : null
}
