import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { validateAssetBaseline, validatePrepared } from './deploy.mjs'
import { validateGatewayState, releaseConfig } from './prepare-gateway.mjs'
const pins = JSON.parse(readFileSync(new URL('./publication.json', import.meta.url)))
const deployment = baseline => [{ id: baseline.deployment, created_on: '2026-11-04', versions: [{ version_id: baseline.version, percentage: 100 }] }]
const versions = baseline => [{ id: baseline.version, metadata: { created_on: '2026-11-04' } }]

test('gateway preserves assets, full runtime, secrets and native service, refusing drift', () => {
  const baseline = pins.gatewayBaseline
  const detail = { id: baseline.version, resources: { script: { etag: baseline.etag }, script_runtime: baseline.runtime, bindings: baseline.bindings } }
  validateGatewayState(deployment(baseline), versions(baseline), detail)
  assert.throws(() => validateGatewayState([{ ...deployment(baseline)[0], id: 'new' }], versions(baseline), detail))
  assert.throws(() => validateGatewayState(deployment(baseline), [{ id: 'other', metadata: { created_on: '2026-11-05' } }], detail))
  assert.throws(() => validateGatewayState(deployment(baseline), versions(baseline), { ...detail, resources: { ...detail.resources, bindings: [] } }))
  const config = releaseConfig('a'.repeat(40))
  assert.equal(config.unsafe.metadata.keep_assets, true)
  assert.deepEqual(config.unsafe.metadata.bindings, baseline.bindings.map(({ name }) => ({ name, type: 'inherit' })))
  assert.equal(config.assets, undefined)
  assert.equal(config.name, 'xeroflow-creative-tools')
})

test('private asset baseline rejects a newer upload or deployment', () => {
  validateAssetBaseline(deployment(pins.assetBaseline), versions(pins.assetBaseline))
  assert.throws(() => validateAssetBaseline(deployment(pins.assetBaseline), versions(pins.gatewayBaseline)))
  assert.throws(() => validateAssetBaseline(deployment(pins.gatewayBaseline), versions(pins.assetBaseline)))
})

test('asset receipt cannot omit old versions or substitute reviewed file hashes', () => {
  assert.throws(() => validatePrepared({ schemaVersion: 1 }, '/unused'))
  assert.throws(() => validatePrepared({ schemaVersion: 2, versions: { '0.11.2-edm4': {} } }, '/unused'))
  const receipt = { schemaVersion: 2, versions: { '0.11.2-edm1': { ...pins.legacy, files: {} }, '0.11.2-edm3': {}, '0.11.2-edm4': {} } }
  assert.throws(() => validatePrepared(receipt, '/unused'), /immutable inventory/)
})
