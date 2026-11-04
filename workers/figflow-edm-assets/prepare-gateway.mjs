// Prepare only: exact live-baseline checks plus a version-only Wrangler config.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const directory = fileURLToPath(new URL('./', import.meta.url))
const root = resolve(directory, '../..')
const pins = JSON.parse(readFileSync(resolve(directory, 'publication.json'), 'utf8'))
export function validateGatewayState(deployments, versions, detail) {
  const active = [...deployments].sort((a, b) => a.created_on.localeCompare(b.created_on)).at(-1)
  const latest = [...(Array.isArray(versions) ? versions : versions.items)].sort((a, b) => a.metadata.created_on.localeCompare(b.metadata.created_on)).at(-1)
  const baseline = pins.gatewayBaseline
  assert.equal(active.id, baseline.deployment, 'Active creative deployment changed; reconcile')
  assert.deepEqual(active.versions, [{ version_id: baseline.version, percentage: 100 }])
  assert.equal(latest.id, baseline.version, 'Latest creative upload changed; refuse inheritance')
  assert.equal(detail.id, baseline.version)
  assert.equal(detail.resources.script.etag, baseline.etag)
  assert.deepEqual(detail.resources.script_runtime, baseline.runtime, 'Existing assets/runtime changed')
  assert.deepEqual(detail.resources.bindings, baseline.bindings, 'Existing bindings changed')
}
export function releaseConfig(commit) {
  assert(/^[a-f0-9]{40}$/.test(commit))
  return {
    name: 'xeroflow-creative-tools', account_id: 'a5b299b3ad15c1b5b895dc66f9357b17', main: 'worker.js',
    compatibility_date: '2026-10-27', compatibility_flags: ['global_fetch_strictly_public'],
    no_bundle: true, find_additional_modules: true,
    rules: [{ type: 'ESModule', globs: ['brand-rpc.mjs'], fallthrough: false }],
    send_metrics: false, dependencies_instrumentation: { enabled: false },
    unsafe: { metadata: {
      keep_assets: true, usage_model: 'standard',
      bindings: pins.gatewayBaseline.bindings.map(({ name }) => ({ name, type: 'inherit' })),
      annotations: { 'workers/commit_sha': commit, 'workers/message': 'Additive immutable FigFlow edm5 from ' + commit }
    } }
  }
}
export function main(commit) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('fetch', 'origin', 'main')
  assert.equal(git('rev-parse', 'HEAD'), commit)
  assert.equal(git('rev-parse', 'origin/main'), commit, 'Gateway release requires current main')
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'Gateway release requires clean source')
  execFileSync('python3', [resolve(directory, 'edm5-gateway.py')], { cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
  const wrangler = (...args) => JSON.parse(execFileSync(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--name', 'xeroflow-creative-tools', '--json'], { cwd: root, encoding: 'utf8' }))
  validateGatewayState(wrangler('deployments', 'list'), wrangler('versions', 'list'), wrangler('versions', 'view', pins.gatewayBaseline.version))
  writeFileSync(resolve(directory, 'gateway-dist/wrangler.release.json'), JSON.stringify(releaseConfig(commit), null, 2) + '\n')
  console.log('Prepared current-source gateway config; no upload or traffic change')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2])
