import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBrandService } from './dist/brand-rpc.mjs'

const source = readFileSync(new URL('./dist/worker.js', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('// motorstack.mjs'), source.indexOf('var handleMotorstack ='))
const native = new Function('__name', section + '\nreturn { createMotorstack, safeURL, extension, MIME, idFor, boundedBody, AdapterError }')((fn) => fn)

function service(offers) {
  const fetcher = async (_url, options) => {
    const { name } = JSON.parse(options.body).params
    const data = name === 'list_oems'
      ? { oems: [{ oem: 'renault', name: 'Renault Australia' }] }
      : { offers }
    return Response.json({ result: { structuredContent: data } })
  }
  const adapter = native.createMotorstack({ fetcher })
  return createBrandService({ ...native, ...adapter, fetcher }, { MOTORSTACK_API_KEY: 'msk_test_fixture_only_0123456789' })
}

test('Renault published month-name dates become ISO without losing offer content', async () => {
  const api = service([
    { title: 'Koleos Evolution 4x2', offer: 'Driveaway offer', end_date: '31 December 2026', disclaimer: 'Terms apply.', image_url: 'https://motorstackmedia.driveagent.io/renault/koleos.png' },
    { title: 'Duster', end_date: '2026-11-30', disclaimer: null }
  ])
  const result = await api.listCreativeCatalog({ brandId: 'renault', kind: 'offers' })
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].endDate, '2026-12-31')
  assert.equal(result.items[0].offer, 'Driveaway offer')
  assert.equal(result.items[0].disclaimer, 'Terms apply.')
  assert.match(result.items[0].artworkAssetId, /^[a-f0-9]{64}$/)
  assert.equal(result.items[1].endDate, '2026-11-30')
})

test('invalid or ambiguous month-name dates still fail closed', async () => {
  for (const end_date of ['31 February 2026', 'December 31, 2026', '31 Dec 2026']) {
    const api = service([{ title: 'Offer', end_date }])
    await assert.rejects(api.listCreativeCatalog({ brandId: 'renault', kind: 'offers' }), /invalid_motorstack_catalog/)
  }
})
