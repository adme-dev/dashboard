import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const commit = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Pass the full reviewed current-main commit')
const build = spawnSync('python3', [root + 'build.py'], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'Multi-brand build failed')
const manifest = JSON.parse(readFileSync(root + 'dist/manifest.json', 'utf8'))
const expected = {
  'worker.js': '17d54fbd7c20ebeb2ae2ae056da47b9989fc295a7f43aca097e75d76ce306349',
  'brand-rpc.mjs': '0787e4c0acb8e2507a8d14f438a977941334212e95e0e490863b71a9812882c2'
}
if (JSON.stringify(manifest.moduleHashes) !== JSON.stringify(expected)) throw new Error('Multi-brand candidate differs from reviewed modules')
const config = {
  name: 'xeroflow-creative-tools', account_id: 'a5b299b3ad15c1b5b895dc66f9357b17', main: 'worker.js',
  compatibility_date: '2026-10-27', compatibility_flags: ['global_fetch_strictly_public'], no_bundle: true, find_additional_modules: true,
  rules: [{ type: 'ESModule', globs: ['brand-rpc.mjs'], fallthrough: false }],
  send_metrics: false, dependencies_instrumentation: { enabled: false },
  unsafe: { metadata: {
    keep_assets: true, usage_model: 'standard',
    bindings: ['ASSETS', 'CREATIVE_AUTH_KEY', 'FIGFLOW_EDM_ASSETS', 'MOTORSTACK_API_KEY'].map(name => ({ name, type: 'inherit' })),
    annotations: { 'workers/commit_sha': commit, 'workers/message': 'MotorStack multi-brand offer dates from ' + commit }
  } }
}
writeFileSync(root + 'dist/wrangler.release.json', JSON.stringify(config, null, 2) + '\n')
console.log('Prepared current-source Creative Worker candidate with inherited assets, secrets and FigFlow binding.')
