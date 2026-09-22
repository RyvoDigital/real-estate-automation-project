/**
 * Refusals, as KEYS, and the one way a key becomes a sentence (22 Sep 2026).
 *
 * The save logic (declare-core, calibrate-core, pick-core, exemption-core)
 * returns a Refusal: a key and its parameters, in no language at all. The
 * sentences live in the copy files, one SET PER LOCALE, and the screen says the
 * refusal in the client's language:
 *
 *   lib/segmentation/copy.ts   DECLARATION_REFUSALS  { pt: {...} }
 *   lib/matching/screen-copy.ts SAVE_REFUSALS        { pt: {...} }
 *
 * 🔒 SPANISH IS DATA, NOT CODE. Adding `es: {...}` beside `pt` in those two
 *    objects is the whole change: the locale type is read from the objects, a
 *    set missing a key fails the typecheck, and localeFor() picks it up for an
 *    agency whose `clients.locale` is es-*. Nothing here needs to change.
 * 🔒 A SENTENCE NEVER TRAVELS IN THE URL. The action redirects with the key
 *    (`?recusa=`) and its parameters (`?p=`); the screen renders the sentence.
 *    Until 22 Sep 2026 the English sentence itself went in `?erro=`.
 * 🔒 A DATABASE ERROR'S TEXT NEVER REACHES AN AGENCY: it is `dbRefused` with its
 *    SQLSTATE code, said in the agency's language.
 */

/** A set of sentences: one template per key; `{name}` placeholders, filled from the params. */
export type Sentences<K extends string> = Record<K, string>

export type Refusal<K extends string = string> = { key: K; params?: Record<string, string> }

/** The client's `clients.locale` ('pt-PT', 'es-ES', …) to a set this catalogue has; Portuguese otherwise. */
export function localeFor<L extends string>(catalogue: Record<L, unknown>, clientLocale: string | null | undefined): L {
  const lang = (clientLocale ?? '').slice(0, 2).toLowerCase()
  return (Object.keys(catalogue).includes(lang) ? lang : 'pt') as L
}

/** A template with its params filled in. A missing param is left visible, never silently dropped. */
export function fill(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? params[k] : m))
}

/** Say a refusal in the client's language. An unknown key is said as the set's own `unknown` sentence. */
export function say<K extends string, L extends string>(
  catalogue: Record<L, Sentences<K>>, clientLocale: string | null | undefined, r: Refusal<string>,
): string {
  const set = catalogue[localeFor(catalogue, clientLocale)]
  const template = (set as Record<string, string>)[r.key] ?? (set as Record<string, string>).unknown
  return fill(template, r.params)
}

/** The query string an action redirects with: the key and its params, never a sentence. */
export function refusalQuery(r: Refusal<string>): string {
  const q = `recusa=${encodeURIComponent(r.key)}`
  return r.params && Object.keys(r.params).length ? `${q}&p=${encodeURIComponent(JSON.stringify(r.params))}` : q
}

/** Read the refusal back from a page's search params; null when there is none. Malformed params are dropped, not trusted. */
export function refusalFrom(sp: { recusa?: string; p?: string }): Refusal<string> | null {
  if (!sp.recusa) return null
  let params: Record<string, string> | undefined
  try {
    const raw = sp.p ? JSON.parse(sp.p) : undefined
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      params = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    }
  } catch { params = undefined }
  return { key: sp.recusa, params }
}
