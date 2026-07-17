#!/usr/bin/env node

// Copies the built dist/sap.min.js into clayjs as the top-level classic script
// clayjs/sap.js. Unlike copy-to-hyperclayjs.js (which appends ESM `export`
// statements), this wrapper is CLASSIC-SAFE: clayjs loads sap.js as a plain
// <script>, so it must NOT contain export syntax, and the whole dist is wrapped
// in an outer IIFE so esbuild's `var Sap` namespace binding never leaks to
// window. The dist assigns window.Sap = Sap.default itself (the native carve-out);
// we mirror that onto clay.Sap and register a resolved clay.loaded.sap for
// uniformity with the async satellites. `--check` exits non-zero when the copy is
// missing or stale, so tooling can assert it is in sync without writing anything.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

const distFile = path.join(rootDir, 'dist', 'sap.min.js')
const clayFile = path.join(rootDir, '..', 'clayjs', 'sap.js')

const HEADER = `// GENERATED — do not edit. Vendored from sapjs/dist/sap.min.js via sapjs
// \`npm run copy-to-clayjs\`. Edit the sapjs source and re-run.
`

const WRAPPER_PREFIX = `(function () {
`

const WRAPPER_SUFFIX = `
var sapDefault = Sap.default;
window.clay = window.clay || {};
window.clay.Sap = sapDefault;
if (typeof window.Sap === 'undefined') window.Sap = sapDefault;
window.clay.loaded = window.clay.loaded || {};
window.clay.loaded.sap = Promise.resolve();
})();
`

function build(dist) {
  return HEADER + WRAPPER_PREFIX + dist + WRAPPER_SUFFIX
}

const isCheck = process.argv.includes('--check')

if (!fs.existsSync(distFile)) {
  if (isCheck) process.exit(1)
  console.error('Error: dist/sap.min.js not found. Run "npm run build" first.')
  process.exit(1)
}

const minified = fs.readFileSync(distFile, 'utf8').trim()
const expected = build(minified)

if (isCheck) {
  if (!fs.existsSync(clayFile)) process.exit(1)
  const actual = fs.readFileSync(clayFile, 'utf8')
  process.exit(actual === expected ? 0 : 1)
}

const clayDir = path.dirname(clayFile)
if (!fs.existsSync(clayDir)) {
  console.error(`Error: clayjs folder not found at ${clayDir}`)
  console.error('Make sure clayjs is in the parent directory.')
  process.exit(1)
}

fs.writeFileSync(clayFile, expected, 'utf8')
console.log('✓ Updated clayjs/sap.js')
