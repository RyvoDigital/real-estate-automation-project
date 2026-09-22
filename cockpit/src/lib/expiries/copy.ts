/**
 * /ops/expiries' words (22 Sep 2026). The ops screens are the operator's own and
 * are written in English, like Today; the refusals are still KEYS said through
 * lib/refusals.ts, one set per locale, so the structure is the agency screens'.
 */
const OBLIGATION_REFUSALS_EN = {
  cardNumber: 'That looks like a card number. Only the brand, the last four digits and the expiry are kept, never the number. Nothing was recorded.',
  noId: 'This form has no id, so sending it twice could not be told from a new entry. Nothing was recorded: reload the screen.',
  unknownAct: 'The form did not say what this is (an entry, a correction, a check, a renewal or a retirement). Nothing was recorded.',
  unknownKind: 'The form did not say which kind of obligation this is. Nothing was recorded.',
  noLabel: 'An obligation needs a name that says what it is. Nothing was recorded.',
  noHead: 'A correction, check, renewal or retirement has to name the entry it follows. Nothing was recorded: reload the screen.',
  badDate: 'The date is not a real date. Nothing was recorded.',
  certidaoNoDate: 'The certidão permanente needs its "válida até" date. Nothing was recorded.',
  procuracaoUnanswered: 'Say whether the procuração states an expiry. Nothing is assumed, and nothing was recorded.',
  procuracaoBoth: 'The procuração was given a date AND marked as stating no expiry. It is one or the other. Nothing was recorded.',
  procuracaoNoDate: 'The procuração states an expiry, so the date is needed. Nothing was recorded.',
  cardNoBrand: 'The card needs its brand (Visa, Mastercard…). Nothing was recorded.',
  cardLastFour: 'The card needs exactly its last four digits. Nothing was recorded.',
  cardExpiry: 'The card needs its expiry month (1 to 12) and year. Nothing was recorded.',
  cardNoServices: 'Name the services charged to this card: when it lapses, all of them stop. Nothing was recorded.',
  cardHasDate: 'A card expires by its month and year, not by a date. Nothing was recorded.',
  justChanged: 'Someone else just changed this obligation, while this form was open. Nothing new was recorded: reload the screen.',
  dbRefused: 'The database refused this, and nothing was recorded (code {code}).',
  unknown: 'This could not be saved, and nothing was recorded.',
} as const satisfies Record<string, string>

export type ObligationRefusalKey = keyof typeof OBLIGATION_REFUSALS_EN

/** The ops screens are in English: one set, `en`. */
export const OBLIGATION_REFUSALS = { en: OBLIGATION_REFUSALS_EN } satisfies Record<string, Record<ObligationRefusalKey, string>>
