/** One valid draft, shared by every onboarding test. Two copies would let the
 *  contract test and the validation tests drift apart, which is the shape of
 *  the defect they exist to catch. */
import type { ClientDraft } from '../../src/lib/onboarding'

export const good: ClientDraft = {
  agencyName: 'Marbella Sur',
  whatsappNumber: '+34600123456',
  timezone: 'Europe/Madrid',
  locale: 'es-ES',
  defaultLanguage: 'es',
  areas: 'Marbella, Estepona',
  agentName: 'Lucía',
  workingHours: 'Mon–Sat 09:30 – 19:30',
  bookingWindowDays: '14',
  minHoursNotice: '4',
  viewingDurationMinutes: '45',
  highValueThresholdEur: '1500000',
  escalateTo: '+34600123456',
  calendarId: 'viewings@marbellasur.es',
  handoffPt: 'Um colega entra em contacto.',
  handoffEn: 'A colleague will be in touch.',
  handoffEs: 'Un compañero se pondrá en contacto.',
}
