import styles from './PageSkeleton.module.css'

/**
 * WHAT A SCREEN LOOKS LIKE WHILE IT IS STILL BEING READ (23 Sep 2026).
 *
 * 🔴 IT REPLACED FrameSkeleton, which drew the whole frame — sidebar included.
 * That was right while each page rendered <Frame> itself, because a boundary
 * then covered the whole viewport. Now the frame is the group's layout, the
 * boundary sits below it, and the chrome never blinks. What a loading state
 * covers is <main>, and nothing else.
 *
 * ── THE RULES, and they are the operator's own ───────────────────────────────
 *
 *   🔒 PLAIN BARS IN THE DESTINATION'S GEOMETRY. Never a number, never a
 *      sentence. A skeleton that guessed at content would assert something it
 *      has not read, and it would be asserting it to the one person who came
 *      to the screen to find out.
 *
 *   🔒 THE GEOMETRY COMES FROM THE PAGE'S OWN STYLESHEET, never from numbers
 *      typed in here. Each loading.tsx imports the same CSS module its screen
 *      imports and reuses the same wrapper classes, so the padding, the max
 *      width and the gaps are the screen's, by construction rather than by
 *      being kept in step. Hand-copied metrics are how a skeleton comes to
 *      differ from the thing it stands in for — measured on 23 Sep, a sidebar
 *      with two boxes where the frame had four dropped everything 58px.
 *
 *   🔒 NOTHING HERE MOVES. §1.14: "No looping or ambient animation. No pulsing
 *      dots, shimmering skeletons, or animated gradients." A block of the right
 *      shape does not need to breathe to say it is waiting. The stamp's pulse
 *      is the one licensed loop in the cockpit (§0.5) and it is not this.
 *
 *   🔒 IT READS NOTHING. A loading state that awaited anything would be the
 *      very thing it is covering for.
 */

/** One plain bar. `w` and `h` are the only measurements, and they are shapes. */
export function Bar({ w, h = 16, r }: { w?: number | string; h?: number; r?: number }) {
  return <span className={styles.bar} style={{ width: w ?? '100%', height: h, borderRadius: r ?? 8 }} aria-hidden="true" />
}

/** The stand-in for a bordered block of rows — a panel, a card, a list. */
export function Panel({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.panel} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Bar key={i} w={i === 0 ? '100%' : i % 2 ? '82%' : '64%'} h={18} />
      ))}
    </div>
  )
}

/**
 * A neutral column, for a boundary covering MANY screens rather than one.
 *
 * 🔒 Used only where there is no single destination to inherit geometry from —
 * the client level has eighteen screens and eighteen stylesheets. Anywhere
 * there IS one destination, the loading state uses that screen's own wrapper
 * class instead, and this must not be reached for as a shortcut.
 */
export function Column({ children }: { children: React.ReactNode }) {
  return <div className={styles.column}>{children}</div>
}

/**
 * The wrapper every loading state uses, so one element carries the "this is
 * being read" announcement and no screen has to remember to.
 */
export function Reading({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Reading…" className={styles.reading}>
      {children}
    </div>
  )
}
