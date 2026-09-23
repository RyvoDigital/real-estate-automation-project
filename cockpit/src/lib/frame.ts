/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE FRAME, THREE STATES. PRESENTED MODE IS A STATE, NOT A SECOND APP.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Brief I §0.1 D1 and D3, brief II §2, docs/cockpit-route-map.md.
 *
 * The cockpit has one navigation model. `frameSide(mode)` returns what the
 * sidebar shows, and the three modes differ in what they OMIT rather than in
 * what they are:
 *
 *   operator    the two landings and the things that are not about one client
 *   client      /c/<client>/… — the switcher, the nav, the counts, the way up
 *   presented   /p/<client>/… — the same geometry with everything that names
 *               another client, or counts anything, removed
 *
 * 🔴 WHY PRESENTED IS A STATE OF THIS FUNCTION AND NOT A SEPARATE COMPONENT.
 * The Stage B check found the answer the hard way: four presented screens were
 * drawn with no sidebar at all, and the operator asked whether that was true.
 * It was not — it was four screens each independently forgetting the frame.
 * A second component would have let them drift again. One function with a mode
 * cannot: every screen gets the same geometry, and the mode decides what is
 * missing from it.
 *
 * 🔒 WHAT PRESENTED MODE REMOVES, and each is a promise to the agency in the
 * room rather than a style choice:
 *
 *   - the client switcher becomes a NAME. A dropdown listing other agencies is
 *     the one control that must not exist while one of them is watching.
 *   - every count goes. "6 waiting" is six other people's business.
 *   - the way up to the operator level goes, for the same reason.
 *   - the nav shrinks to this meeting's screens, in the agency's language.
 *   - a marker says it is a presentation, so nobody mistakes the screen for
 *     the whole cockpit.
 */

export type FrameMode = 'operator' | 'client' | 'presented'

/** A destination in the sidebar. `href` is relative to the frame's root. */
export type NavItem = {
  /** The slug under /c/<client>/ or /p/<client>/. '' is the landing. */
  slug: string
  /** English, for the operator. */
  label: string
  /** Portuguese, for the agency. Only the presented-capable items need one. */
  labelPt?: string
  /** Whether this screen appears in the sidebar, or is reached from another. */
  inNav: boolean
  /**
   * 🔴 EXPLICIT, NEVER DEFAULTED.
   *
   * A screen that was never considered for presented mode must be a decision
   * somebody made, not an omission that inherited `false`. The exemption
   * declaration sat unplaced for four design rounds precisely because nothing
   * forced the question, and the route test refuses a screen that has not
   * answered it.
   */
  presented: boolean
  /** Why it refuses presentation. Required when `presented` is false. */
  refusesBecause?: string
  /**
   * 🔴 WHETHER THE SCREEN EXISTS YET.
   *
   * The sidebar is the map of the cockpit, not of today's progress, so an
   * unbuilt screen still appears — but a plain link to a 404 tells the operator
   * nothing about WHICH of the two it is: not built, or broken. One is expected
   * and one needs reporting, and they look identical.
   *
   * 🔒 An unbuilt item renders as a NON-LINK, not as a disabled link. §0.4-7: a
   * greyed control still reads as one click from opening. There is nothing to
   * open, so there is no control.
   *
   * `tests/links-resolve.test.ts` fails when this disagrees with the
   * filesystem, in either direction — so building a screen and forgetting to
   * flip this is caught too.
   */
  built: boolean
}

/**
 * Every client-level screen, and its answer to the presented question.
 *
 * The order is the sidebar's order, which is the order the briefs set: the
 * landing, then what needs you, then the client's own material, then the
 * things you configure.
 */
export const CLIENT_SCREENS: NavItem[] = [
  { slug: '', built: true, label: 'Landing', inNav: true, presented: false, refusesBecause: 'it counts every automation and names what is holding each one' },
  { slug: 'escalations', built: true, label: 'Escalations', inNav: true, presented: false, refusesBecause: 'a queue of people waiting is not a thing to show the people who kept them waiting' },
  { slug: 'anomalies', built: true, label: 'Anomalies', inNav: true, presented: false, refusesBecause: 'it is the record of what the system got wrong, and it is evidence before it is a screen' },
  { slug: 'contacts', built: true, label: 'Contacts', inNav: true, presented: false, refusesBecause: 'the contact record carries the consent ledger, which is read with the agency one contact at a time, not browsed' },
  { slug: 'campaign', built: true, label: 'Campaign', inNav: true, presented: false, refusesBecause: 'a forecast of who would be written to is an operator decision before it is an agency conversation' },
  { slug: 'declaration', built: false, label: 'Declaration', labelPt: 'De onde vieram estes contactos', inNav: true, presented: true },
  { slug: 'listings', built: true, label: 'Listings', labelPt: 'Imóveis', inNav: true, presented: true },
  /*
   * 🔴 NAMED FOR WHAT AN OPERATOR OPENS IT TO FIND OUT, which is the test every
   * other screen was held to.
   *
   * It was "Expiries" in the design. That names one of the things it holds — a
   * date running out — rather than the thing itself, which also covers a
   * registration nobody has ever checked and one the register says is
   * cancelled. Neither of those is an expiry, and both are the same question:
   * is what we hold still good.
   *
   * 🔒 It is ALSO not the designed Expiries, which is the clearance re-check
   * and answers "which standing clearances no longer hold". That one needs a
   * `clearances` table nothing writes (improvements §3.22), so it is a
   * different screen that does not exist rather than this one under a better
   * name. When it is built it gets its own entry here.
   */
  { slug: 'still-good', built: true, label: 'What is still good', inNav: true, presented: false, refusesBecause: 'it reads across every property this client holds, and an agency meeting is about one' },
  { slug: 'silence', built: true, label: 'Silence', inNav: true, presented: false, refusesBecause: 'it is a worklist of who to chase, in our words not theirs' },
  { slug: 'closes', built: false, label: 'Closes', labelPt: 'O que fechou', inNav: true, presented: true },
  { slug: 'review', built: true, label: 'Review', inNav: true, presented: false, refusesBecause: 'the reconciliation explains our own gaps, which is an operator conversation' },
  { slug: 'thresholds', built: false, label: 'Thresholds', labelPt: 'O que procura quem lhe compra', inNav: true, presented: true },
  { slug: 'import', built: true, label: 'Import', labelPt: 'A lista que nos enviou', inNav: true, presented: true },
  { slug: 'report', built: true, label: 'Report', inNav: true, presented: false, refusesBecause: 'its artefact is what the agency receives; the page is the operator checking it first' },
  { slug: 'settings', built: true, label: 'Settings', inNav: true, presented: false, refusesBecause: 'it holds numbers that decide who receives a message' },

  // Reached from another screen rather than from the sidebar.
  //
  // 🔴 A SUB-SCREEN MUST BE REGISTERED IN ITS OWN RIGHT. Found by
  // tests/middleware-screen.test.ts, 20 Sep 2026: with these four missing,
  // /p/<client>/listings/<id>/publish resolved to the slug `listings`, which
  // IS presented-capable — so the gate in depth, an English operator screen
  // that refuses presentation, would have been served to an agency wearing
  // the listings screen's answer. A screen inheriting its parent's answer is
  // the same defect as a screen defaulting to one.
  { slug: 'triage', built: false, label: 'Triage', labelPt: 'Quem vê primeiro', inNav: false, presented: true },
  { slug: 'exemption', built: false, label: 'Exemption', labelPt: 'Este imóvel não precisa de certificado?', inNav: false, presented: true },
  { slug: 'piece', built: false, label: 'The prepared piece', labelPt: 'O anúncio preparado', inNav: false, presented: true },
  { slug: 'publish', built: false, label: 'May this be advertised?', inNav: false, presented: false, refusesBecause: 'it is the gate in depth, and its sentences are English, from publication/gate.ts and requirements.ts' },
  { slug: 'policy', built: true, label: 'What each country requires', inNav: false, presented: false, refusesBecause: 'its sentences are English, from the policy modules' },
  { slug: 'templates', built: true, label: 'Templates', inNav: false, presented: false, refusesBecause: "it is Meta's review state, in Meta's vocabulary" },
  { slug: 'notice', built: true, label: 'The re-check notice', labelPt: 'Uma coisa a confirmar', inNav: false, presented: true },
]

/**
 * 🔒 SCREENS THAT HOLD A FORM. Switching client on one of these cannot carry
 * the form's subject — a lead, a number or a template belongs to the agency
 * whose screen it is — so the switcher lands on the other client's LANDING and
 * says why (brief §1.3: "either carries the form's subject with it, or refuses
 * and says why. Never silently re-points an in-progress declaration, threshold
 * answer or close at a different agency").
 */
export const HOLDS_A_FORM: readonly string[] = ['escalations', 'contacts', 'templates', 'import']

export type SwitchTarget = {
  id: string
  name: string
  href: string
  /** Why this lands somewhere other than the screen you are on. Null when it does not. */
  why: string | null
}

/**
 * Where the switcher sends you, per client. Pure, so the rule is testable
 * without a render.
 *
 *   🔒 THE SAME SCREEN, THE OTHER AGENCY — that is what makes it a switcher
 *      rather than a way out.
 *   🔒 EXCEPT where the screen holds a form, or where the URL names something
 *      that belongs to THIS client (a phone, a batch, a listing): the other
 *      agency has no such row, so the landing is the honest destination.
 *   🔒 THE CLIENT YOU ARE ON IS NOT A DESTINATION. It is named as where you are.
 */
export function switchTargets(
  clients: { id: string; name: string }[],
  opts: { currentClientId?: string; currentSlug?: string; deep?: boolean } = {},
): SwitchTarget[] {
  const { currentClientId, currentSlug, deep } = opts
  const screen = CLIENT_SCREENS.find((s) => s.slug === (currentSlug ?? ''))
  const landsOnLanding =
    !screen || !screen.built || !screen.inNav || deep === true || HOLDS_A_FORM.includes(screen.slug)
  /*
   * 🔒 THE MOST SPECIFIC REASON WINS. A screen can be several of these at once
   * — Templates holds a form AND is not in the sidebar — and the one worth
   * saying is the one about what you would lose, not about the sidebar.
   */
  const why = screen && HOLDS_A_FORM.includes(screen.slug)
    ? 'this screen holds a form, and nothing typed here is carried across'
    : deep
      ? 'this page is about one record of this agency’s, which the other does not have'
      : !screen || !screen.inNav || !screen.built
        ? 'that screen does not exist for another agency yet, so this opens their landing'
        : null

  return clients
    .filter((c) => c.id !== currentClientId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      href: landsOnLanding ? `/c/${c.id}` : `/c/${c.id}/${screen!.slug}`.replace(/\/$/, ''),
      why: landsOnLanding ? why : null,
    }))
}

export type FrameSide = {
  mode: FrameMode
  /** The marker that says this is a presentation. Null in the other modes. */
  marker: string | null
  /** The switcher: pressable in the ordinary frames, a still name in presented. */
  switcher: { name: string; pressable: boolean } | null
  /** The way up to the operator level, with its count. Null in presented. */
  up: { label: string; href: string } | null
  /** 🔒 Presented mode shows no count anywhere. */
  showsCounts: boolean
  /**
   * The sidebar's destinations, already filtered for the mode.
   *
   * 🔒 `built: false` renders as a NON-LINK. The sidebar is the map of the
   * cockpit rather than of today's progress, so an unbuilt screen still
   * appears — but a link to a 404 leaves the operator unable to tell "not built
   * yet" from "broken", and one of those needs reporting.
   */
  items: { slug: string; label: string; href: string; built: boolean }[]
}

/**
 * The sidebar, for one mode.
 *
 * `current` is the slug of the screen being rendered. It matters only in
 * presented mode, where the nav is reduced to this meeting's screen — a nav
 * listing twelve other screens invites a click into one of them while somebody
 * is watching.
 */
export function frameSide(
  mode: FrameMode,
  opts: { client?: { id: string; name: string }; current?: string } = {},
): FrameSide {
  const { client, current } = opts

  if (mode === 'presented') {
    if (!client) throw new Error('presented mode without a client — the frame would have nothing to name')
    const screen = CLIENT_SCREENS.find((s) => s.slug === (current ?? ''))
    if (!screen) throw new Error(`presented mode for an unknown screen: ${current}`)
    if (!screen.presented) {
      // 🔴 A hard failure rather than a fallback. A screen that refuses
      // presentation and is rendered in it anyway would show an agency
      // something the design decided they must not see, and a silent fallback
      // to the ordinary frame would do it while looking correct.
      throw new Error(`${screen.slug || 'the landing'} refuses presented mode: ${screen.refusesBecause}`)
    }
    return {
      mode,
      marker: 'Em apresentação',
      switcher: { name: client.name, pressable: false },
      up: null,
      showsCounts: false,
      items: [
        { slug: screen.slug, label: screen.labelPt ?? screen.label, href: `/p/${client.id}/${screen.slug}`, built: screen.built },
      ],
    }
  }

  if (mode === 'client') {
    if (!client) throw new Error('client mode without a client')
    return {
      mode,
      marker: null,
      switcher: { name: client.name, pressable: true },
      up: { label: 'Operator level', href: '/today' },
      showsCounts: true,
      items: CLIENT_SCREENS.filter((s) => s.inNav).map((s) => ({
        slug: s.slug,
        label: s.label,
        href: `/c/${client.id}/${s.slug}`.replace(/\/$/, ''),
        built: s.built,
      })),
    }
  }

  return {
    mode,
    marker: null,
    switcher: null,
    up: null,
    /*
     * 🔴 FALSE, AND IT WAS `true` UNTIL 23 SEP 2026 — a claim with nowhere to
     * land. The count is rendered in exactly one place, the "‹ way up" link
     * (components/Frame.tsx), and the operator frame HAS no way up: it is the
     * top. So every operator screen ran readCounts() — six database requests —
     * computed a badge, and threw it away. Measured: 6 of /clients's 32
     * requests per navigation, for a number no operator has ever seen.
     *
     * This does not remove a count from the screen; there was none. If the
     * operator sidebar should carry one, that is a design decision and it
     * needs an element to put it in first.
     */
    showsCounts: false,
    items: [
      // All five operator screens exist. They are on the OLD visual direction
      // (see docs/cockpit-route-map.md §2.3), which is a different fact from
      // not being built.
      /*
       * 🔒 CLIENTS SITS ABOVE TODAY (operator's decision, 23 Sep 2026): this is
       * the list of who exists, and Today is what needs me now. The list comes
       * first because it is the smaller question and the stabler one.
       */
      { slug: 'clients', label: 'Clients', href: '/clients', built: true },
      { slug: 'today', label: 'Today', href: '/today', built: true },
      { slug: 'month', label: 'The Month', href: '/', built: true },
      { slug: 'infrastructure', label: 'Infrastructure', href: '/ops/infrastructure', built: true },
      { slug: 'onboarding', label: 'Onboarding', href: '/onboarding', built: true },
      // /ops/expiries (brief §2.3, C5): the cross-client expiries and Ryvo's own. Added 22 Sep 2026.
      { slug: 'expiries', label: 'Expiries', href: '/ops/expiries', built: true },
    ],
  }
}

/**
 * The request header the proxy writes the current screen's slug onto, so a
 * LAYOUT can tell the frame which nav item is current.
 *
 * A layout is not given the pathname — there is no server API for it — and the
 * frame must know which item to mark. It lives here rather than in proxy.ts
 * because all three layouts need it and proxy.ts pulls in `@supabase/ssr`;
 * until 23 Sep 2026 two of them wrote the literal `'x-ryvo-screen'` instead.
 *
 * 🔴 IT IS COSMETIC. A request header is exactly what a caller can forge
 * (CVE-2025-29927). Nothing may be refused or permitted on the strength of it;
 * it decides which nav item is bold. See the top of src/proxy.ts.
 */
export const SCREEN_HEADER = 'x-ryvo-screen'

/**
 * Which operator nav item a path sits on, or null if it is not an operator
 * screen at all.
 *
 * 🔒 DERIVED FROM THE NAV, never a second list. `frameSide('operator')` already
 * holds every operator destination and its href; a map written out again here
 * would be a copy that agrees until one of them changes. That is the same rule
 * `tests/lib/routes.ts` exists for, applied to the product side.
 */
export function operatorScreenFor(pathname: string): string | null {
  const items = frameSide('operator').items
  const exact = items.find((i) => i.href === pathname)
  if (exact) return exact.slug
  /*
   * Then the longest href this path sits UNDER, so /onboarding/new marks
   * Onboarding. '/' is excluded deliberately: The Month's href is a prefix of
   * every path in the cockpit and would otherwise claim all of them.
   */
  const under = items
    .filter((i) => i.href !== '/' && pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]
  return under ? under.slug : null
}

/**
 * The cross-client contact search — the ONLY cross-client surface, and
 * deliberately the thinnest one in the cockpit.
 *
 * 🔴 IT ANSWERS "WHICH CLIENT?" AND THEN IT HANDS OFF. The operator's
 * constraint, 20 September 2026: a number, the client it belongs to, and a link
 * into that client's contact record. Not the history, not the ledger, not the
 * consent state. Those are client-scoped and they stay client-scoped.
 *
 * The reason is architectural rather than tidy: a cross-client surface that
 * grew a history column would be an operator-level view of a person's consent
 * record, assembled across every agency that has ever held their number. That
 * is the one shape this whole architecture avoids, and it would arrive one
 * useful column at a time.
 *
 * A test asserts this type has exactly these fields.
 */
export type ContactSearchHit = {
  phone: string
  clientId: string
  clientName: string
  /** Where to go for everything else. */
  href: string
}

/**
 * 🔴 THE REFUSAL THAT MATTERS, ASSERTED WHERE THE RENDER HAPPENS.
 *
 * Every page under `/p/<client>/` calls this with its own slug, as a literal,
 * before it renders anything.
 *
 * WHY, AND IT IS THIS REPO'S OWN LESSON. proxy.ts already 404s a `/p/` path
 * for a screen that refuses presentation — but the top of that file records
 * why it is not the security boundary: Next's middleware has been bypassable
 * by a crafted request header (CVE-2025-29927), and *a check the caller can
 * skip is not a check*. The proxy also hands the layout the screen slug on a
 * header, which is precisely the kind of value a forged request controls. A
 * layout that trusted it could render the presented frame for `declaration`
 * while the page underneath rendered `settings`.
 *
 * So the page asserts its own identity, from a literal in its own source, on
 * the path the real caller takes — the same shape as requireOperator() being
 * called by every page rather than trusted from the edge.
 */
export function assertPresentable(slug: string): void {
  const screen = CLIENT_SCREENS.find((s) => s.slug === slug)
  if (!screen) throw new Error(`no such screen: ${slug} — a page under /p/ must name a registered screen`)
  if (!screen.presented) {
    throw new Error(`${slug || 'the landing'} refuses presented mode: ${screen.refusesBecause}`)
  }
}
