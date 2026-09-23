// Preload for rendering a component OUTSIDE Next (tests/render-month-preview.tsx),
// under tsx, which compiles to CommonJS:
//   - a CSS module becomes a proxy returning each class's own name, so the raw
//     stylesheet, inlined unhashed, matches; a global stylesheet becomes nothing;
//   - 'server-only' becomes an empty module. It guards the BUNDLE (a client
//     component importing a server module fails the build); a script run by hand
//     is not a bundle, and the build still enforces it.
//
// 🔴 PREVIEW_NAMESPACE=1 — WHY IT EXISTS (23 Sep 2026).
//
// Returning each class's own NAME is faithful only while a preview inlines
// module stylesheets alone. The moment it also inlines a global one, the two
// collide: src/app/globals.css has `.main > * { animation: settle 200ms }` for
// the OLD Shell, which really does write `className="main"`, and
// Frame.module.css has its own `.main`. Next hashes the module's to
// `.Frame-module__hzMlwG__main` (confirmed in .next/static/chunks) so they can
// never meet — but unhashed they are the same selector, and the preview showed
// every new screen fading in over 200ms. A page that does not do that.
//
// That is the exact failure the fidelity rule names, pointing the other way: a
// preview that renders something the page does NOT render is just as useless as
// one that misses something it does. So with this flag the proxy namespaces per
// module file, the way the bundler does, and the preview rewrites that file's
// selectors to match.
const Module = require('node:module')
const { basename } = require('node:path')

/** The prefix a module file's classes take, mirroring the bundler's hashing. */
const nsFor = (filename) => basename(filename).replace(/\.module\.css$/, '').replace(/[^a-zA-Z0-9]/g, '_')

const NAMESPACE = process.env.PREVIEW_NAMESPACE === '1'

require.extensions['.css'] = (m, filename) => {
  if (!filename.endsWith('.module.css')) { m.exports = {}; return }
  const ns = NAMESPACE ? `${nsFor(filename)}__` : ''
  m.exports = new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : `${ns}${String(k)}`) })
}

/**
 * Rewrite one module stylesheet's class selectors the same way, so the inlined
 * CSS matches what the proxy handed the component.
 *
 * `.foo` becomes `.today__foo`. A decimal like `.5s` is untouched because a
 * class must start with a letter or underscore, and `./path` because the next
 * character is a slash.
 */
function namespaceCss(filename, text) {
  if (!NAMESPACE || !filename.endsWith('.module.css')) return text
  const ns = nsFor(filename)
  return text.replace(/\.([a-zA-Z_][\w-]*)/g, (_m, cls) => `.${ns}__${cls}`)
}
module.exports = { namespaceCss, nsFor }

const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return require.resolve('node:path') && __filename
  return resolve.call(this, request, ...rest)
}
