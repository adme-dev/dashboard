import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBrandService } from './brand-rpc.mjs'

const source = readFileSync(new URL('./dist/worker.js', import.meta.url), 'utf8')
const section = source.slice(source.indexOf('// motorstack.mjs'), source.indexOf('var handleMotorstack ='))
const native = new Function('__name', section + '\nreturn { createMotorstack, safeURL, extension, MIME, idFor, boundedBody, AdapterError }')((fn) => fn)
const key = 'msk_test_fixture_only_0123456789'
const provider = 'https://oem-variants.pages.dev/api/mcp'

function service(catalog) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    const { name } = JSON.parse(options.body).params
    return Response.json({ result: { structuredContent: name === 'list_oems' ? { oems: [{ oem: 'geely', name: 'Geely Auto Australia' }] } : catalog[name] } })
  }
  const adapter = native.createMotorstack({ fetcher })
  return { api: createBrandService({ ...native, ...adapter, fetcher }, { MOTORSTACK_API_KEY: key }), calls }
}

test('variants and offers are scoped to a listed brand and return bounded content without source URLs', async () => {
  const { api, calls } = service({
    get_variants: { vehicles: [{ title: 'Geely EX5 Complete', model: 'EX5', badge: 'Complete', build_year: 2027, egc_price: 41990, colours: [{ name: 'Arctic White', hex: null, main_photo_url: 'https://motorstackmedia.driveagent.io/geely/ex5.png' }] }] },
    get_offers: { offers: [{ title: 'Finance offer', model: 'EX5', offer: '0.09% comparison rate', end_date: '2026-10-31', disclaimer: 'Terms apply.\nFinance subject to approval.', image_url: 'https://motorstackmedia.driveagent.io/geely/offer.png' }] }
  })
  const variants = await api.listCreativeCatalog({ brandId: 'geely', kind: 'variants' })
  const offers = await api.listCreativeCatalog({ brandId: 'geely', kind: 'offers' })
  assert.equal(variants.items[0].egcPrice, 41990)
  assert.equal(variants.items[0].colours[0].hasImage, true)
  assert.equal(offers.items[0].endDate, '2026-10-31')
  assert.equal(offers.items[0].disclaimer, 'Terms apply.\nFinance subject to approval.')
  assert.equal(JSON.stringify([variants, offers]).includes('https://'), false)
  assert.equal(JSON.stringify([variants, offers]).includes(key), false)
  assert.deepEqual(calls.map(call => JSON.parse(call.options.body).params.name), ['list_oems', 'get_variants', 'list_oems', 'get_offers'])
  assert.ok(calls.every(call => call.url === provider))
})

test('rejects unlisted brands and caller supplied fields before requesting a catalogue', async () => {
  const { api, calls } = service({})
  for (const input of [{ brandId: '../geely', kind: 'offers' }, { brandId: 'geely', kind: 'other' }, { brandId: 'geely', kind: 'offers', url: 'https://localhost' }]) {
    await assert.rejects(api.listCreativeCatalog(input), /invalid_brand_id|invalid_catalog_query/)
  }
  assert.equal(calls.length, 0)
  await assert.rejects(api.listCreativeCatalog({ brandId: 'ford', kind: 'offers' }), /brand_not_available/)
  assert.equal(calls.length, 1)
})

test('does not silently omit oversized offer terms', async () => {
  const { api } = service({ get_offers: { offers: [{ title: 'Offer', disclaimer: 'T'.repeat(12001) }] } })
  await assert.rejects(api.listCreativeCatalog({ brandId: 'geely', kind: 'offers' }), /invalid_motorstack_catalog/)
})

test('returns an empty catalogue for a brand with no published offers', async () => {
  const { api } = service({ get_offers: { oem: 'geely', matched: 0, note: 'No live offers for this OEM.' } })
  const result = await api.listCreativeCatalog({ brandId: 'geely', kind: 'offers' })
  assert.deepEqual(result.items, [])
})

test('rejects an omitted offers array unless the provider explicitly reports zero matches', async () => {
  const { api } = service({ get_offers: { oem: 'geely', matched: 2 } })
  await assert.rejects(api.listCreativeCatalog({ brandId: 'geely', kind: 'offers' }), /invalid_motorstack_catalog/)
})
