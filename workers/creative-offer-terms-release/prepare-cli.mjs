import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('.', import.meta.url))
const commit = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Pass the full reviewed current-main commit')
const repo = resolve(root, '../..')
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
git('fetch', 'origin', 'main')
assert.equal(git('rev-parse', 'HEAD'), commit, 'Release commit differs from current source')
assert.equal(git('rev-parse', 'origin/main'), commit, 'Release requires current main')
assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'Release requires clean source')
const baseline = JSON.parse(readFileSync(root + 'source-baseline.json', 'utf8'))
const wrangler = (...args) => JSON.parse(execFileSync(process.execPath, [resolve(repo, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--name', 'xeroflow-creative-tools', '--json'], { cwd: repo, encoding: 'utf8', timeout: 45000 }))
const deployments = wrangler('deployments', 'list')
const versions = wrangler('versions', 'list')
const active = [...deployments].sort((a, b) => a.created_on.localeCompare(b.created_on)).at(-1)
const latest = [...versions].sort((a, b) => a.metadata.created_on.localeCompare(b.metadata.created_on)).at(-1)
assert.equal(active.id, baseline.deployment, 'Active Creative Suite changed; reconcile')
assert.deepEqual(active.versions, [{ version_id: baseline.version, percentage: 100 }])
assert.equal(latest.id, baseline.version, 'Another Worker upload exists; reconcile before inheritance')
const detail = wrangler('versions', 'view', baseline.version)
assert.equal(detail.resources.script.etag, baseline.etag)
assert.deepEqual(detail.resources.script_runtime, baseline.runtime)
const ordered = values => [...values].sort((a, b) => a.name.localeCompare(b.name))
assert.deepEqual(ordered(detail.resources.bindings), ordered(baseline.bindings), 'Creative Suite bindings changed')
const build = spawnSync('python3', [root + 'build.py'], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'Offer terms build failed')
const manifest = JSON.parse(readFileSync(root + 'dist/manifest.json', 'utf8'))
const expected = {
  'worker.js': 'e3a46a4088dc6505e70a9af616cc24f2783875c011bb7696c1bcc3a37b33cb86',
  'brand-rpc.mjs': '2e7e46795ef98825d3ba385229d2fbd970157f5c14cc9b9d0d585fcce36ed86b'
}
if (JSON.stringify(manifest.moduleHashes) !== JSON.stringify(expected)) throw new Error('Offer terms candidate differs from reviewed modules')
const config = {
  name: 'xeroflow-creative-tools', account_id: 'a5b299b3ad15c1b5b895dc66f9357b17', main: 'worker.js',
  compatibility_date: '2026-10-27', compatibility_flags: ['global_fetch_strictly_public'], no_bundle: true, find_additional_modules: true,
  rules: [{ type: 'ESModule', globs: ['brand-rpc.mjs'], fallthrough: false }],
  send_metrics: false, dependencies_instrumentation: { enabled: false },
  unsafe: { metadata: {
    keep_assets: true, usage_model: 'standard',
    bindings: ['ASSETS', 'CREATIVE_AUTH_KEY', 'CREATIVE_STANDALONE_ASSETS', 'FIGFLOW_EDM_ASSETS', 'MOTORSTACK_API_KEY'].map(name => ({ name, type: 'inherit' })),
    annotations: { 'workers/commit_sha': commit, 'workers/message': 'MotorStack complete offer terms and grade images from ' + commit }
  } }
}
writeFileSync(root + 'dist/wrangler.release.json', JSON.stringify(config, null, 2) + '\n')
console.log('Prepared reviewed Creative Worker with inherited assets, secrets and FigFlow binding.')
