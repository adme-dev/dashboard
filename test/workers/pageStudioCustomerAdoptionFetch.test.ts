import { beforeEach, expect, it, vi } from 'vitest'
import { handleCustomerAdoptionFetch } from '../../workers/page-studio-management/src/customerAdoptionFetch'
import { callCustomerAdoptionGrant } from '../../server/utils/pageStudio/customerAdoptionClient'
import { CUSTOMER_ADOPTION_URL as URL, CUSTOMER_ADOPTION_UNAVAILABLE as UNAVAILABLE } from '../../shared/pageStudio/customerAdoptionTransport'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), grant: vi.fn(), withdraw: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerAdoptionGrant', () => ({ inspectCustomerAdoptionGrant: mocks.inspect, grantCustomerAdoption: mocks.grant, withdrawCustomerAdoptionGrant: mocks.withdraw }))
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const config = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true' }
const base = { siteId: id(1), operator: { actorId: id(2), loginSessionHash: 'a'.repeat(64) }, expectedEnvironment: 'production' }
const body = { grantId: id(3), expectedGrantId: null, expectedRevision: 0, sourceDigest: 'b'.repeat(64), expiresAt: '2026-10-23T10:00:00.000Z', reason: 'Complete retained adoption' }
const receipt = { grantId: body.grantId, siteId: base.siteId, revision: 1, sourceDigest: body.sourceDigest, issuedAt: '2026-10-23T09:00:00.000Z', expiresAt: body.expiresAt }
const input = { ...base, request: { action: 'grant', body } }
const run = vi.fn()
const request = (value: unknown = input) => new Request(URL, { method: 'POST', body: JSON.stringify(value) })
const transport = () => { const fetch = vi.fn(req => handleCustomerAdoptionFetch(req, config, run)); return { fetch, env: { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } } } }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.inspect.mockResolvedValue({ sourceDigest: body.sourceDigest, selection: null })
  mocks.grant.mockResolvedValue({ historical: false, grant: receipt })
  mocks.withdraw.mockResolvedValue({ withdrawn: true, grant: receipt })
})
it('round trips each explicit action to exactly one bounded helper', async () => {
  const { env, fetch } = transport()
  expect(await callCustomerAdoptionGrant({ ...base, request: { action: 'inspect' } }, env)).toEqual({ action: 'inspect', siteId: base.siteId, sourceDigest: body.sourceDigest, selection: null })
  expect(await callCustomerAdoptionGrant(input, env)).toEqual({ action: 'grant', siteId: base.siteId, historical: false, grant: receipt })
  expect(await callCustomerAdoptionGrant({ ...base, request: { action: 'withdraw', grantId: body.grantId, expectedRevision: 1 } }, env)).toEqual({ action: 'withdraw', siteId: base.siteId, withdrawn: true, grant: receipt })
  expect(mocks.inspect).toHaveBeenCalledExactlyOnceWith({ siteId: base.siteId, operator: base.operator }, { env: config, runTransaction: run })
  expect(mocks.grant).toHaveBeenCalledExactlyOnceWith({ siteId: base.siteId, operator: base.operator, body }, { env: config, runTransaction: run })
  expect(mocks.withdraw).toHaveBeenCalledExactlyOnceWith({ siteId: base.siteId, operator: base.operator, grantId: body.grantId, expectedRevision: 1 }, { runTransaction: run })
  expect(fetch).toHaveBeenCalledTimes(3)
})
it.each(['source', 'proof', 'claims', 'readSource', 'bucket'])('rejects injected %s without helper dispatch', async key => {
  expect((await handleCustomerAdoptionFetch(request({ ...input, [key]: {} }), config, run)).status).toBe(400)
  expect(mocks.grant).not.toHaveBeenCalled()
})
it.each([{ ...input, expectedEnvironment: 'staging' }, { ...input, request: { action: 'prepare' } }, { ...input, request: { action: 'grant', body: { ...body, expectedRevision: 1 } } }])('rejects unsupported action or authority', async value => {
  expect((await handleCustomerAdoptionFetch(request(value), config, run)).status).toBe(400)
  expect(mocks.grant).not.toHaveBeenCalled()
})
it.each([{}, { ...config, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { ...config, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }])('rejects unavailable production configuration', async env => {
  expect((await handleCustomerAdoptionFetch(request(), env, run)).status).toBe(503)
  expect(mocks.grant).not.toHaveBeenCalled()
})
it('rejects method, URL, oversized body and malformed UTF8', async () => {
  for (const req of [new Request(URL), new Request(`${URL}?force=1`, { method: 'POST' })]) expect((await handleCustomerAdoptionFetch(req, config, run)).status).toBe(404)
  for (const raw of [' '.repeat(16385), '{', new Uint8Array([255])]) expect((await handleCustomerAdoptionFetch(new Request(URL, { method: 'POST', body: raw }), config, run)).status).toBe(400)
  expect(mocks.grant).not.toHaveBeenCalled()
})
it.each(['siteId', 'grantId', 'revision', 'sourceDigest', 'expiresAt'])('rejects mismatched receipt %s', async key => {
  const changed = { ...receipt, [key]: key === 'revision' ? 2 : key === 'sourceDigest' ? 'c'.repeat(64) : key === 'expiresAt' ? '2026-10-24T00:00:00.000Z' : id(99) }
  mocks.grant.mockResolvedValue({ historical: false, grant: changed })
  await expect(callCustomerAdoptionGrant(input, transport().env)).rejects.toMatchObject({ statusCode: 503 })
})
it('returns historical replay as historical and rejects leaked private fields', async () => {
  const { env } = transport()
  mocks.grant.mockResolvedValueOnce({ historical: true, grant: receipt }).mockResolvedValueOnce({ historical: false, grant: receipt, credential: 'private' })
  expect(await callCustomerAdoptionGrant(input, env)).toMatchObject({ historical: true })
  await expect(callCustomerAdoptionGrant(input, env)).rejects.toMatchObject({ statusCode: 503 })
})
it('redacts helper errors and does not retry uncertain acknowledgements', async () => {
  const { env, fetch } = transport()
  mocks.grant.mockRejectedValue({ statusCode: 409, message: 'private credential' })
  await expect(callCustomerAdoptionGrant(input, env)).rejects.toMatchObject({ statusCode: 409, statusMessage: UNAVAILABLE })
  expect(fetch).toHaveBeenCalledOnce()
  const lost = vi.fn().mockRejectedValue(Error('lost acknowledgement'))
  await expect(callCustomerAdoptionGrant(input, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch: lost } })).rejects.toMatchObject({ statusCode: 503 })
  expect(lost).toHaveBeenCalledOnce()
})
it('rejects digest substitution and a configuration change while helper awaits', async () => {
  const digest = await collectionDigest(input)
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, requestDigest: digest, value: { action: 'grant', siteId: base.siteId, historical: false, grant: receipt } }, { headers: { 'x-request-digest': 'c'.repeat(64) } }))
  await expect(callCustomerAdoptionGrant(input, { ...config, PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503 })
  const changed = { ...config }
  mocks.grant.mockImplementation(async () => { changed.PAGE_STUDIO_RELEASE_ENVIRONMENT = 'staging'; return { historical: false, grant: receipt } })
  expect((await handleCustomerAdoptionFetch(request(), changed, run)).status).toBe(503)
})
