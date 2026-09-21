// Preload for rendering a component OUTSIDE Next (tests/render-month-preview.tsx),
// under tsx, which compiles to CommonJS:
//   - a CSS module becomes a proxy returning each class's own name, so the raw
//     stylesheet, inlined unhashed, matches; a global stylesheet becomes nothing;
//   - 'server-only' becomes an empty module. It guards the BUNDLE (a client
//     component importing a server module fails the build); a script run by hand
//     is not a bundle, and the build still enforces it.
const Module = require('node:module')
require.extensions['.css'] = (m, filename) => {
  m.exports = filename.endsWith('.module.css') ? new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : String(k)) }) : {}
}
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return require.resolve('node:path') && __filename
  return resolve.call(this, request, ...rest)
}
