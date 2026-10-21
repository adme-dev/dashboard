import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import control from '../../workers/page-studio-control/src/index'
import { handleManagedTransferAuthorityFetch } from '../../workers/page-studio-management/src/managedTransferAuthority'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { TRANSFER_AUTHORITIES, TRANSFER_AUTHORITY_ORIGIN, transferAuthorityPath, type TransferAuthority } from '../../shared/pageStudio/managedTransferAuthorityTransport'
import { authorityInputs, authorityEnv, context } from '../helpers/pageStudio/transferAuthorityTransport'

const mocks = vi.hoisted(() => ({ context: vi.fn(), execution: vi.fn(), source: vi.fn(), catalogue: vi.fn(), destination: vi.fn(), forms: vi.fn(), copy: vi.fn(), authoring: vi.fn(), retention: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/managedTransferExecution', () => ({ readManagedTransferExecutionContext: mocks.context, authorizeManagedTransferExecution: mocks.execution }))
vi.mock('~~/server/utils/pageStudio/managedTransferSourceDrafts', () => ({ authorizeManagedTransferSourceDrafts: mocks.source }))
vi.mock('~~/server/utils/pageStudio/managedTransferDestinationCatalogue', () => ({ authorizeManagedTransferDestinationCatalogue: mocks.catalogue }))
vi.mock('~~/server/utils/pageStudio/managedTransferDestinationExecution', () => ({ authorizeManagedTransferDestinationExecution: mocks.destination }))
vi.mock('~~/server/utils/pageStudio/managedTransferFormsHistory', () => ({ authorizeManagedTransferFormsHistory: mocks.forms }))
vi.mock('../../workers/page-studio-management/src/managedTransferCopyExecutionManagement', () => ({ handleManagedTransferCopyExecutionManagement: mocks.copy }))
vi.mock('../../workers/page-studio-management/src/managedTransferDestinationAuthoringManagement', () => ({ handleManagedTransferDestinationAuthoringManagement: mocks.authoring }))
vi.mock('../../workers/page-studio-management/src/managedTransferSourceRetentionManagement', () => ({ handleManagedTransferSourceRetentionManagement: mocks.retention }))
const keys = Object.keys(TRANSFER_AUTHORITIES) as TransferAuthority[]
const handlers = [mocks.context, mocks.execution, mocks.source, mocks.catalogue, mocks.destination, mocks.copy, mocks.forms, mocks.authoring, mocks.retention]
const run = vi.fn(), upstream = vi.fn()
const receiver = vi.fn((request: Request) => handleManagedTransferAuthorityFetch(request, authorityEnv, run))
const env = () => ({ DASHBOARD_ORIGIN: 'https://app.xeroflow.io', PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48), NATIVE_SCHEMA_TRANSPORT: 'placed-fetch', PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch: receiver } })
const request = (key: TransferAuthority, input = authorityInputs[key]) => new Request('https://control.internal' + transferAuthorityPath(key), { method: 'POST', body: JSON.stringify(input) })
const invoke = (key: TransferAuthority, input = authorityInputs[key], config = env()) => control.fetch(request(key, input), config as never)
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', upstream)
  upstream.mockResolvedValue(Response.json({ legacy: true }))
  for (const handler of handlers) handler.mockImplementation(async input => input)
  mocks.context.mockResolvedValue(context)
  for (const handler of [mocks.copy, mocks.authoring, mocks.retention]) handler.mockImplementation(async input => ({ ok: true, requestDigest: await collectionDigest(input), value: input.authorization }))
})
afterEach(() => vi.unstubAllGlobals())
it.each(keys)('places exact %s unchanged handler and denies fresh revocation', async (key) => {
  const index = keys.indexOf(key), handler = handlers[index], input = authorityInputs[key]
  const response = await invoke(key)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(key === 'execution/context' ? context : input)
  expect(handler).toHaveBeenCalledOnce()
  const args = handler.mock.calls[0]
  if ([mocks.copy, mocks.authoring, mocks.retention].includes(handler)) {
    expect(args[0]).toMatchObject({ expectedEnvironment: 'production', authorization: input })
    expect(args[2]).toBe(run)
  } else { expect(args[0]).toEqual(input); expect(args[1].runTransaction).toBe(run) }
  handler.mockRejectedValueOnce({ statusCode: 403, message: 'private-secret' })
  const denied = await invoke(key)
  expect(denied.status).toBe(403)
  expect(await denied.text()).not.toContain('private-secret')
  expect(upstream).not.toHaveBeenCalled()
})
it.each(keys)('denies malformed/action injection and missing binding for %s', async (key) => {
  for (const input of [{}, { ...authorityInputs[key] as object, unexpected: true }, { ...authorityInputs[key] as object, action: 'publish' }]) expect((await invoke(key, input)).status).toBe(400)
  for (const field of ['PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY', 'NATIVE_SCHEMA_TRANSPORT']) expect((await invoke(key, authorityInputs[key], { ...env(), [field]: undefined } as never)).status).toBe(503)
  expect(handlers[keys.indexOf(key)]).not.toHaveBeenCalled()
  expect(upstream).not.toHaveBeenCalled()
})
it.each(keys)('binds complete request digest and exact returned identity for %s', async (key) => {
  for (const kind of ['digest', 'foreign', 'redirect', 'oversize', 'throw', 'utf8']) {
    const fetch = async (request: Request) => {
      const body = await request.json() as { input: unknown }
      const headers = { 'x-request-digest': kind === 'digest' ? '0'.repeat(64) : await collectionDigest(body) }
      if (kind === 'throw') throw new Error('private-secret')
      if (kind === 'redirect') return new Response(null, { status: 302, headers })
      if (kind === 'oversize') return new Response(' '.repeat(TRANSFER_AUTHORITIES[key].maximum + 1), { headers })
      if (kind === 'utf8') return new Response(new Uint8Array([255]), { headers })
      const value = key === 'execution/context' ? context : body.input
      return Response.json(kind === 'foreign' ? { ...value as object, operationId: '00000000-0000-4000-8000-000000000099' } : value, { headers })
    }
    expect((await invoke(key, authorityInputs[key], { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: { fetch } } as never)).status).toBe(503)
  }
  expect(upstream).not.toHaveBeenCalled()
})
it.each(keys)('requires full production provisioning prerequisite for %s', async (key) => {
  for (const changes of [{ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, { PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging' }, { PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' }, { PAGE_STUDIO_PROVISIONER: {} }, { PAGE_STUDIO_PROVISIONER: { createProvisioning() {} } }, { PAGE_STUDIO_PROVISIONER: { readProvisioning() {} } }]) {
    const response = await handleManagedTransferAuthorityFetch(new Request(TRANSFER_AUTHORITY_ORIGIN + transferAuthorityPath(key), { method: 'POST', body: JSON.stringify({ expectedEnvironment: 'production', input: authorityInputs[key] }) }), { ...authorityEnv, ...changes }, run)
    expect(response.status).toBe(503)
  }
  expect(handlers[keys.indexOf(key)]).not.toHaveBeenCalled()
})
it.each(keys)('rejects wrong private route/method/environment for %s', async (key) => {
  for (const url of ['https://foreign.invalid' + transferAuthorityPath(key), TRANSFER_AUTHORITY_ORIGIN + transferAuthorityPath(key) + '?override=1']) expect((await handleManagedTransferAuthorityFetch(new Request(url, { method: 'POST', body: '{}' }), authorityEnv, run)).status).toBe(404)
  const url = TRANSFER_AUTHORITY_ORIGIN + transferAuthorityPath(key)
  expect((await handleManagedTransferAuthorityFetch(new Request(url), authorityEnv, run)).status).toBe(404)
  expect((await handleManagedTransferAuthorityFetch(new Request(url, { method: 'POST', body: JSON.stringify({ expectedEnvironment: 'staging', input: authorityInputs[key] }) }), authorityEnv, run)).status).toBe(400)
})
it.each(['copy', 'authoring', 'retention'] as const)('retains %s inner envelope digest and typed error validation', async (name) => {
  const key = keys[handlers.indexOf(mocks[name])]
  mocks[name].mockResolvedValueOnce({ ok: true, requestDigest: '0'.repeat(64), value: authorityInputs[key] })
  expect((await invoke(key)).status).toBe(503)
  mocks[name].mockImplementationOnce(async input => ({ ok: false, requestDigest: await collectionDigest(input), error: { statusCode: 409, message: 'private-secret' } }))
  expect((await invoke(key)).status).toBe(409)
})
it('captures bound fetch before body awaits and leaves shared staging forwarding unchanged', async () => {
  const service = { fetch: vi.fn(async function (this: unknown, request: Request) { expect(this).toBe(service); return receiver(request) }) }, original = service.fetch
  const pending = invoke('execution/context', authorityInputs['execution/context'], { ...env(), PAGE_STUDIO_NATIVE_SCHEMA_AUTHORITY: service })
  service.fetch = vi.fn()
  expect((await pending).status).toBe(200)
  expect(original).toHaveBeenCalledOnce()
  expect(service.fetch).not.toHaveBeenCalled()
  expect((await invoke('execution/context', authorityInputs['execution/context'], { ...env(), DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev' })).status).toBe(200)
  expect(upstream).toHaveBeenCalledOnce()
})
it('admits the real nested authoring proof above the resource 16KiB limit', async () => {
  expect(JSON.stringify(authorityInputs['destination-authoring/authorize']).length).toBeGreaterThan(16384)
  expect((await invoke('destination-authoring/authorize')).status).toBe(200)
})

it.each(keys)('bounds request bytes before any authority call for %s', async (key) => {
  const request = new Request('https://control.internal' + transferAuthorityPath(key), { method: 'POST', body: ' '.repeat(TRANSFER_AUTHORITIES[key].maximum + 1) })
  expect((await control.fetch(request, env() as never)).status).toBe(413)
  expect(receiver).not.toHaveBeenCalled()
  expect(upstream).not.toHaveBeenCalled()
})
it.each(['copy', 'authoring', 'retention'] as const)('rejects %s handler input/result mutation despite recomputed digest', async (name) => {
  const key = keys[handlers.indexOf(mocks[name])]
  mocks[name].mockImplementationOnce(async input => {
    input.authorization = authorityInputs['copy-graph/authorize']
    input.expectedEnvironment = 'staging'
    return { ok: true, requestDigest: await collectionDigest(input), value: input.authorization }
  })
  expect((await invoke(key)).status).toBe(503)
})
it('rejects a schema-valid foreign source at fresh authority rather than trusting parsed identity', async () => {
  const key = 'source-drafts/authorize'
  const foreign = structuredClone(authorityInputs[key]) as { request: { fenceIntent: { scope: { siteId: string } } } }
  foreign.request.fenceIntent.scope.siteId = 'foreign-site'
  mocks.source.mockRejectedValueOnce({ statusCode: 403 })
  expect((await invoke(key, foreign)).status).toBe(403)
  expect(mocks.source).toHaveBeenCalledOnce()
})
it('does not intercept nonmapped mutation paths', async () => {
  for (const path of ['execution/start', 'forms-history/prepare', 'destination-authoring/read', 'source-retention/retain']) {
    expect((await control.fetch(new Request('https://control.internal/internal/page-studio/managed-transfers/' + path, { method: 'POST', body: '{}' }), env() as never)).status).toBe(200)
  }
  expect(receiver).not.toHaveBeenCalled()
  expect(upstream).toHaveBeenCalledTimes(4)
})

it('admits a valid retention JSON body above 16KiB while retaining its canonical wrapper limit', async () => {
  const key = 'source-retention/authorize'
  const body = JSON.stringify(authorityInputs[key]) + ' '.repeat(17000)
  expect(body.length).toBeLessThan(TRANSFER_AUTHORITIES[key].maximum)
  const response = await control.fetch(new Request('https://control.internal' + transferAuthorityPath(key), { method: 'POST', body }), env() as never)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(authorityInputs[key])
})
