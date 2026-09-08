/**
 * `vcf` ships no types. Declared narrowly rather than as `any`, so a wrong
 * assumption about the shape fails at compile time instead of producing
 * `undefined` in a name column.
 *
 * Verified against the installed package, not from memory: `parse` returns an
 * array, a property is present-or-absent, and a repeated property (two TEL
 * lines, which is common) comes back as an ARRAY of properties rather than one.
 */
declare module 'vcf' {
  interface VCardProperty {
    valueOf(): string
  }
  class VCard {
    get(key: string): VCardProperty | VCardProperty[] | undefined
    data: Record<string, unknown>
  }
  namespace VCard {
    function parse(input: string): VCard[]
  }
  export = VCard
}
