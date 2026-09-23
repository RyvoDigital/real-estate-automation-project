/**
 * React's <ViewTransition>, typed.
 *
 * 🔒 WHY A SHIM RATHER THAN AN UPGRADE. The App Router does not run the React
 * in package.json — it runs the one Next vendors, `next/dist/compiled/react`,
 * which is 19.3.0-canary and exports ViewTransition and addTransitionType. The
 * TYPES come from @types/react 19.2.18, which is the stable line and does not.
 * So the component is there at runtime and absent at compile time, and this is
 * the narrow declaration that closes that gap without pinning the project to a
 * canary release it is already using.
 *
 * Checked, not assumed: `require('next/dist/compiled/react').ViewTransition`
 * is a symbol; `require('react').ViewTransition` from node_modules is
 * undefined.
 */
import 'react'

declare module 'react' {
  /**
   * A boundary the browser animates across a navigation.
   *
   * `enter` and `exit` name a CSS class targeted as
   * `::view-transition-new(.name)` / `::view-transition-old(.name)`. The
   * literal `'none'` means no animation at all, which is what the cockpit uses
   * for everything ARRIVING — see src/app/motion.css.
   */
  export const ViewTransition: React.FC<{
    children?: React.ReactNode
    name?: string
    enter?: string | Record<string, string>
    exit?: string | Record<string, string>
    share?: string
    default?: string
  }>
}
