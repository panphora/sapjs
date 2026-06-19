#!/usr/bin/env node

// Copies the built dist/sap.min.js into hyperclayjs as a vendor file, appending
// the window-export + ES-export wrapper so the public API attaches to
// window.hyperclay during evaluation. Mirrors hyper-undo/scripts/copy-to-hyperclayjs.js.
// Run via `npm run copy-to-hyperclayjs` (which builds dist first). `--check`
// exits non-zero when the vendor copy is missing or stale, so tooling can assert
// the copy is in sync without writing anything.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

const distFile = path.join(rootDir, 'dist', 'sap.min.js')
const vendorFile = path.join(rootDir, '..', 'hyperclayjs', 'src', 'vendor', 'sapjs.vendor.js')

// The form-state serializer is shared verbatim with hyperclayjs persist so the
// two never drift. It is a pure ESM module (no window/side effects), so the
// vendor copy is the source plus a "generated" header.
const serializeSrc = path.join(rootDir, 'src', 'control-serialize.js')
const serializeVendor = path.join(rootDir, '..', 'hyperclayjs', 'src', 'vendor', 'control-serialize.vendor.js')
const SERIALIZE_HEADER = `// GENERATED — do not edit. Vendored from sapjs/src/control-serialize.js
// via sapjs \`npm run copy-to-hyperclayjs\`. Edit the sapjs source and re-run.
`
function buildSerializeVendor() {
  return SERIALIZE_HEADER + '\n' + fs.readFileSync(serializeSrc, 'utf8').trim() + '\n'
}

// The dist exposes the ES namespace as the in-scope global `Sap` (esbuild
// --global-name). `Sap.default` is the sap object; alias it so it can be
// re-exported under the name `Sap` without colliding with that namespace binding.
const WRAPPER_CODE = `
// Auto-export to window unless suppressed by loader.
var sapDefault = Sap.default;
if (!window.__hyperclayNoAutoExport) {
  window.hyperclay = window.hyperclay || {};
  window.hyperclay.Sap = sapDefault;
  window.Sap = sapDefault;
  window.h = window.hyperclay;
}

export { sapDefault as Sap };
export default sapDefault;
`

const isCheck = process.argv.includes('--check')

if (!fs.existsSync(distFile)) {
  if (isCheck) process.exit(1)
  console.error('Error: dist/sap.min.js not found. Run "npm run build" first.')
  process.exit(1)
}

const minified = fs.readFileSync(distFile, 'utf8').trim()
const expected = minified + '\n' + WRAPPER_CODE

const expectedSerialize = buildSerializeVendor()

if (isCheck) {
  if (!fs.existsSync(vendorFile)) process.exit(1)
  if (!fs.existsSync(serializeVendor)) process.exit(1)
  const actual = fs.readFileSync(vendorFile, 'utf8')
  const actualSerialize = fs.readFileSync(serializeVendor, 'utf8')
  process.exit(actual === expected && actualSerialize === expectedSerialize ? 0 : 1)
}

const vendorDir = path.dirname(vendorFile)
if (!fs.existsSync(vendorDir)) {
  console.error(`Error: hyperclayjs vendor folder not found at ${vendorDir}`)
  console.error('Make sure hyperclayjs is in the parent directory.')
  process.exit(1)
}

fs.writeFileSync(vendorFile, expected, 'utf8')
console.log('✓ Updated hyperclayjs/src/vendor/sapjs.vendor.js')

fs.writeFileSync(serializeVendor, expectedSerialize, 'utf8')
console.log('✓ Updated hyperclayjs/src/vendor/control-serialize.vendor.js')
