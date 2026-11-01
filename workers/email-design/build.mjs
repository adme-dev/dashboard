import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

await build({
  entryPoints: ['admission.mjs'],
  outfile: 'dist/worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  external: [
    'cloudflare:workers',
    'node:*',
    '@react-email/render',
    '@cloudflare/puppeteer',
    'puppeteer',
    'gifenc',
    'pngjs',
    'pg-native'
  ]
})

// Reject an alias regression before any deployment: this Worker must delegate
// verification, never fall back to a locally embedded session signing key.
const output = readFileSync('dist/worker.mjs', 'utf8')
assert(output.includes('Session authority unavailable'), 'Missing canonical Pages authority verifier')
assert(!output.includes('your-secret-key-change-in-production'), 'Local signing verifier leaked into private Worker')
