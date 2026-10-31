import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
test('media release pins reviewed modules and retains runtime/assets/bindings', () => {
  const run = spawnSync(process.execPath, [root + 'prepare-cli.mjs', 'a'.repeat(40)], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const config = JSON.parse(readFileSync(root + 'dist/wrangler.release.json', 'utf8'))
  const manifest = JSON.parse(readFileSync(root + 'dist/manifest.json', 'utf8'))
  const baseline = JSON.parse(readFileSync(root + 'source/media-release-baseline.json', 'utf8'))
  assert.deepEqual(manifest.modules, baseline.candidateModuleHashes)
  assert.deepEqual(config.compatibility_flags, ['global_fetch_strictly_public'])
  assert.equal(config.compatibility_date, baseline.runtime.compatibility_date)
  assert.equal(config.unsafe.metadata.usage_model, baseline.runtime.usage_model)
  assert.equal(config.unsafe.metadata.keep_assets, true)
  assert.deepEqual(config.unsafe.metadata.bindings, baseline.bindings.map(({name}) => ({name,type:'inherit'})))
  assert.equal(config.assets, undefined)
  assert.equal(config.unsafe.metadata.assets, undefined)
  assert.equal(config.no_bundle, true)
  assert.equal(config.unsafe.metadata.annotations['workers/commit_sha'], 'a'.repeat(40))
})
