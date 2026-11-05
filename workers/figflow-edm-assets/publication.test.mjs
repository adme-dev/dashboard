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

test('publication retains all old pins and adds only the exact-source edm5 inventory', () => {
  assert.deepEqual(Object.keys(pins.packages).sort(), ['0.11.2-edm3', '0.11.2-edm4', '0.11.2-edm5'])
  assert.equal(Object.keys(pins.legacy.files).length, 30)
  assert.equal(Object.keys(pins.packages['0.11.2-edm3'].files).length, 30)
  assert.equal(Object.keys(pins.packages['0.11.2-edm4'].files).length, 30)
  assert.equal(Object.keys(pins.packages['0.11.2-edm5'].files).length, 31)
  assert.equal(Object.keys(pins.legacy.files).length + Object.values(pins.packages).reduce((total, item) => total + Object.keys(item.files).length, 0), 121)
  assert.equal(pins.legacy.archiveSha256, '91f09af7f0e59a8a3f353afa67ad736ba1e7b1ec215c7b7c329191449026c27c')
  assert.equal(pins.packages['0.11.2-edm3'].archiveSha256, '33c6c4d2f60157014296b0fa74f26aa308e6d5bed19ac7c142bd04725cec0fbf')
  assert.equal(pins.packages['0.11.2-edm4'].archiveSha256, '8978bdb7a4f2bb7d86456fd8f29157e44e997544448f95f212d8a74802c61c88')
  assert.equal(pins.packages['0.11.2-edm5'].source, '404e3ff06f1619d928218c5dd0236143209750be')
  assert.equal(pins.packages['0.11.2-edm5'].ciRunId, '41856781523')
  assert.equal(pins.packages['0.11.2-edm5'].archiveSha256, 'c18d7d71745a7bff680ca8c8163e8ec9be08e215602dbc4f6459a135bd43f508')
  assert.deepEqual(pins.assetBaseline, { deployment: '1d62c12f-6f7d-4778-82a8-3dfa6e88ea4a', version: 'b278e54b-debc-4af1-9173-fba6964dfb87' })
  assert.equal(pins.gatewayBaseline.version, 'b50acb4f-30d5-48a1-a711-339f3b98c979')
  assert.equal(pins.gatewayBaseline.modules['worker.js'], 'f1f4602ed93ff4a9aa75d0f611f74a7ba6d7a6be9c890fba7df669c253b0c665')
})

test('asset receipt cannot omit old versions, edm5, or substitute reviewed file hashes', () => {
  assert.throws(() => validatePrepared({ schemaVersion: 1 }, '/unused'))
  assert.throws(() => validatePrepared({ schemaVersion: 2, versions: { '0.11.2-edm4': {} } }, '/unused'))
  assert.throws(() => validatePrepared({ schemaVersion: 2, versions: { '0.11.2-edm1': {}, '0.11.2-edm3': {}, '0.11.2-edm4': {} } }, '/unused'))
  const receipt = { schemaVersion: 2, versions: { '0.11.2-edm1': { ...pins.legacy, files: {} }, '0.11.2-edm3': {}, '0.11.2-edm4': {}, '0.11.2-edm5': {} } }
  assert.throws(() => validatePrepared(receipt, '/unused'), /immutable inventory/)
})
