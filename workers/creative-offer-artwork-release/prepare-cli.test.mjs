import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

test('offer artwork release keeps all current Creative Worker settings and bindings', () => {
  const root = new URL('.', import.meta.url)
  const result = spawnSync(process.execPath, [new URL('prepare-cli.mjs', root).pathname, 'a'.repeat(40)], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const config = JSON.parse(readFileSync(new URL('dist/wrangler.release.json', root), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('dist/manifest.json', root), 'utf8'))
  assert.equal(config.name, 'xeroflow-creative-tools')
  assert.deepEqual(config.compatibility_flags, ['global_fetch_strictly_public'])
  assert.equal(config.compatibility_date, '2026-10-27')
  assert.equal(config.unsafe.metadata.keep_assets, true)
  assert.deepEqual(config.unsafe.metadata.bindings.map(binding => binding.name), ['ASSETS', 'CREATIVE_AUTH_KEY', 'FIGFLOW_EDM_ASSETS', 'MOTORSTACK_API_KEY'])
  assert.ok(config.unsafe.metadata.bindings.every(binding => binding.type === 'inherit'))
  assert.equal(config.assets, undefined)
  assert.equal(config.no_bundle, true)
  assert.equal(config.unsafe.metadata.annotations['workers/commit_sha'], 'a'.repeat(40))
  assert.equal(manifest.baseVersion, 'c74e9804-3e14-4a2b-a6b7-b65e79266008')
})
