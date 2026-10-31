// Generate a normal Wrangler CLI configuration without reading any credential files.
// This prepares local artifacts only; upload/deploy remain separate reviewed commands.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import './build.mjs'
const root = fileURLToPath(new URL('.', import.meta.url))
const commit = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Pass the full reviewed current-main commit')
const manifest = JSON.parse(readFileSync(root + 'dist/manifest.json', 'utf8'))
if (manifest.account !== 'a5b299b3ad15c1b5b895dc66f9357b17' || manifest.script !== 'xeroflow-creative-tools') throw new Error('Immutable target mismatch')
const routingBaseline = JSON.parse(readFileSync(root + 'source/media-release-baseline.json', 'utf8'))
if (JSON.stringify(manifest.modules) !== JSON.stringify(routingBaseline.candidateModuleHashes)) throw new Error('Media release requires exact reviewed candidate modules')
const config = {
  name: manifest.script, account_id: manifest.account, main: 'worker.js',
  compatibility_date: '2026-10-27', compatibility_flags: ['global_fetch_strictly_public'], no_bundle: true, find_additional_modules: true,
  rules: [{ type: 'ESModule', globs: ['brand-rpc.mjs'], fallthrough: false }],
  send_metrics: false, dependencies_instrumentation: { enabled: false },
  unsafe: { metadata: {
    keep_assets: true, usage_model: 'standard',
    bindings: ['ASSETS', 'CREATIVE_AUTH_KEY', 'MOTORSTACK_API_KEY'].map(name => ({ name, type: 'inherit' })),
    annotations: { 'workers/commit_sha': commit, 'workers/message': 'MotorStack media connection from ' + commit }
  } }
}
writeFileSync(root + 'dist/wrangler.release.json', JSON.stringify(config, null, 2) + '\n')
console.log('Prepared normal Wrangler configuration with keep_assets and inherited bindings; no credentials read, upload or deployment.')
