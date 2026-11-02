import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const commit = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Pass the full reviewed current-main commit')
const build = spawnSync('python3', [root + 'build.py'], { encoding: 'utf8' })
if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'Offer artwork build failed')
const manifest = JSON.parse(readFileSync(root + 'dist/manifest.json', 'utf8'))
const expected = {
  'worker.js': '43c5ec9662c127185de0f0b4ed7cd6cca667e85b53e8aa98e44d32b581575dd0',
  'brand-rpc.mjs': '3e299b879319fbedfb990604716483cfcaceb82b814df33f4413643234f68b16'
}
if (JSON.stringify(manifest.moduleHashes) !== JSON.stringify(expected)) throw new Error('Offer artwork candidate differs from reviewed modules')
if (manifest.baseVersion !== 'c74e9804-3e14-4a2b-a6b7-b65e79266008' || manifest.baseDeployment !== '4b9f9b97-bdaa-4603-a154-a69f52d88b6c') throw new Error('Creative Worker baseline changed')
const config = {
  name: 'xeroflow-creative-tools', account_id: 'a5b299b3ad15c1b5b895dc66f9357b17', main: 'worker.js',
  compatibility_date: '2026-10-27', compatibility_flags: ['global_fetch_strictly_public'], no_bundle: true, find_additional_modules: true,
  rules: [{ type: 'ESModule', globs: ['brand-rpc.mjs'], fallthrough: false }],
  send_metrics: false, dependencies_instrumentation: { enabled: false },
  unsafe: { metadata: {
    keep_assets: true, usage_model: 'standard',
    bindings: ['ASSETS', 'CREATIVE_AUTH_KEY', 'FIGFLOW_EDM_ASSETS', 'MOTORSTACK_API_KEY'].map(name => ({ name, type: 'inherit' })),
    annotations: { 'workers/commit_sha': commit, 'workers/message': 'MotorStack offer artwork from ' + commit }
  } }
}
writeFileSync(root + 'dist/wrangler.release.json', JSON.stringify(config, null, 2) + '\n')
console.log('Prepared current-source Creative Worker candidate with inherited assets, secrets and FigFlow binding.')
