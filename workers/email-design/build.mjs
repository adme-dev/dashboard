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
