import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../../workers/page-studio-control/src/index'
import { ContentAttachmentCompletionSchema } from '../../shared/pageStudio/content-attachment'
import { handleContentAttachmentCompletion } from '../../workers/page-studio-management/src/contentAttachmentCompletion'

const path = '/internal/page-studio/content-attachments/completion'
const completion = ContentAttachmentCompletionSchema.parse({
  activationId: '10000000-0000-4000-8000-000000000001',
  identity: `cms_attach_${'a'.repeat(64)}`,
  operationId: 'attach_one',
  proofDigest: 'b'.repeat(64),
  scope: { businessId: 'business_one', clientId: 'client_one', environment: 'staging', siteId: 'site_one', tenantId: 'tenant_one' },
  version: 1
})
const readCompletion = vi.fn<(input: unknown) => Promise<unknown>>()
const upstream = vi.fn<(request: Request) => Promise<Response>>()
function environment(overrides: Record<string, unknown> = {}) {
  return {
    DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev',
    PAGE_STUDIO_CONTROL_SECRET: 's'.repeat(48),
    CONTENT_COMPLETION_TRANSPORT: 'management-rpc',
    PAGE_STUDIO_MANAGEMENT_COMPLETION: { readCompletion },
    ...overrides
  } as Parameters<typeof worker.fetch>[1]
}
function request(body: string = JSON.stringify(completion), headers: HeadersInit = {}) {
  return new Request(`https://control.internal${path}`, { method: 'POST', body, headers })
}
async function expectSafeFailure(response: Response, status: number) {
  expect(response.status).toBe(status)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const body = await response.json()
  expect(body).toMatchObject({ error: { code: expect.any(String), message: expect.any(String) } })
  expect(JSON.stringify(body)).not.toMatch(/private-secret|postgres:|stack-trace|attacker\.invalid/)
  expect(upstream).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  readCompletion.mockResolvedValue({ ok: true, value: completion })
  upstream.mockImplementation(async () => Response.json({ http: true }))
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => vi.unstubAllGlobals())

describe('completion gateway private RPC transport', () => {
  it('uses only the approved origin environment and exact receipt, ignoring caller credentials', async () => {
    const response = await worker.fetch(request(JSON.stringify(completion), {
      'authorization': 'Bearer private-secret', 'cookie': 'private-secret',
      'x-page-studio-session': 'private-secret', 'x-expected-environment': 'production'
    }), environment())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.json()).toEqual(completion)
    expect(readCompletion).toHaveBeenCalledExactlyOnceWith({ expectedEnvironment: 'staging', completion })
    expect(upstream).not.toHaveBeenCalled()
  })

  it('returns null for a missing committed receipt and never caches a prior success', async () => {
    readCompletion.mockResolvedValueOnce({ ok: true, value: completion }).mockResolvedValueOnce({ ok: true, value: null })
    expect(await (await worker.fetch(request(), environment())).json()).toEqual(completion)
    expect(await (await worker.fetch(request(), environment())).json()).toBeNull()
    expect(readCompletion).toHaveBeenCalledTimes(2)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each(['{', 'null', '{}', JSON.stringify({ ...completion, extra: 'unexpected' }), JSON.stringify({ ...completion, version: 2 })])('rejects invalid JSON or receipts before RPC: %s', async (body) => {
    await expectSafeFailure(await worker.fetch(request(body), environment()), 400)
    expect(readCompletion).not.toHaveBeenCalled()
  })

  it('rejects oversized bytes without trusting Content-Length or requiring it', async () => {
    for (const headers of [{}, { 'content-length': '1' }, { 'content-length': '4097' }]) {
      await expectSafeFailure(await worker.fetch(request('é'.repeat(2049), headers), environment()), 413)
    }
    expect(readCompletion).not.toHaveBeenCalled()
  })

  it('bounds an unknown-length streamed request body', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2048).fill(32))
        controller.enqueue(new Uint8Array(2049).fill(32))
        controller.close()
      }
    })
    const init = { method: 'POST', body: stream, duplex: 'half' } satisfies RequestInit & { duplex: string }
    await expectSafeFailure(await worker.fetch(new Request(`https://control.internal${path}`, init), environment()), 413)
    expect(readCompletion).not.toHaveBeenCalled()
  })

  it('rejects a receipt from another environment before RPC', async () => {
    const body = { ...completion, scope: { ...completion.scope, environment: 'production' } }
    await expectSafeFailure(await worker.fetch(request(JSON.stringify(body)), environment()), 503)
    expect(readCompletion).not.toHaveBeenCalled()
  })

  it.each([undefined, {}, { readCompletion: 'not-callable' }])('never falls back to HTTP when the selected RPC binding is missing or malformed', async (binding) => {
    await expectSafeFailure(await worker.fetch(request(), environment({ PAGE_STUDIO_MANAGEMENT_COMPLETION: binding })), 503)
  })

  it('never retries or falls back after an RPC exception', async () => {
    readCompletion.mockRejectedValueOnce(new Error('private-secret postgres://attacker.invalid stack-trace'))
    await expectSafeFailure(await worker.fetch(request(), environment()), 503)
    expect(readCompletion).toHaveBeenCalledOnce()
  })

  it.each([
    null, {}, { ok: true }, { ok: true, value: {} },
    { ok: true, value: completion, extra: 'private-secret' },
    { ok: true, value: { ...completion, activationId: '10000000-0000-4000-8000-000000000002' } },
    { ok: true, value: { ...completion, identity: `cms_attach_${'c'.repeat(64)}` } },
    { ok: true, value: { ...completion, operationId: 'attach_two' } },
    { ok: true, value: { ...completion, proofDigest: 'd'.repeat(64) } },
    ...['businessId', 'clientId', 'siteId', 'tenantId'].map(key => ({ ok: true, value: { ...completion, scope: { ...completion.scope, [key]: 'foreign_scope' } } })),
    { ok: true, value: { ...completion, scope: { ...completion.scope, environment: 'production' } } },
    { ok: true, value: { ...completion, extra: 'private-secret' } },
    { ok: false, error: { statusCode: 200, code: 'attacker.invalid', message: 'private-secret' } },
    { ok: false, error: { statusCode: 400, code: 'CMS_COMPLETION_DENIED', message: 'private-secret' } },
    { ok: false, error: { statusCode: 418, code: 'UNKNOWN', message: 'private-secret stack-trace' } }
  ])('fails closed on malformed or foreign RPC results: %j', async (result) => {
    readCompletion.mockResolvedValueOnce(result)
    await expectSafeFailure(await worker.fetch(request(), environment()), 503)
  })

  it('never reflects an unknown error even if it supplies a plausible status', async () => {
    readCompletion.mockResolvedValueOnce({ ok: false, error: { statusCode: 403, code: 'UNKNOWN_PRIVATE', message: 'private-secret postgres://attacker.invalid' } })
    await expectSafeFailure(await worker.fetch(request(), environment()), 503)
  })

  it.each([400, 403, 503])('preserves recognized denial status %s with its own safe message', async (status) => {
    const read = vi.fn<(sql: string, params: unknown[]) => Promise<{ metadata: unknown } | null>>()
    if (status === 503) read.mockRejectedValue(new Error('private-secret'))
    else read.mockResolvedValue({ metadata: { ...completion, operationId: 'another_operation' } })
    const result = await handleContentAttachmentCompletion(
      status === 400 ? null : { expectedEnvironment: 'staging', completion }, 'staging', read
    )
    if (result.ok) throw new Error('Expected the authority fixture to return a denial')
    readCompletion.mockResolvedValueOnce({ ...result, error: { ...result.error, message: 'private-secret postgres://attacker.invalid stack-trace' } })
    await expectSafeFailure(await worker.fetch(request(), environment()), status)
    expect(readCompletion).toHaveBeenCalledOnce()
  })

  it('retains HTTP for other paths and methods', async () => {
    for (const [target, method] of [[`${path}/other`, 'POST'], ['/internal/page-studio/checkpoints', 'POST'], [path, 'GET']]) {
      const response = await worker.fetch(new Request(`https://control.internal${target}`, { method }), environment())
      expect(await response.json()).toEqual({ http: true })
    }
    expect(upstream).toHaveBeenCalledTimes(3)
    expect(readCompletion).not.toHaveBeenCalled()
  })

  it('retains existing production HTTP transport when RPC is unconfigured', async () => {
    const response = await worker.fetch(request(), environment({ DASHBOARD_ORIGIN: 'https://app.xeroflow.io', CONTENT_COMPLETION_TRANSPORT: undefined, PAGE_STUDIO_MANAGEMENT_COMPLETION: undefined }))
    expect(await response.json()).toEqual({ http: true })
    expect(upstream.mock.calls[0]?.[0].url).toBe(`https://app.xeroflow.io${path}`)
    expect(readCompletion).not.toHaveBeenCalled()
  })

  it('rejects unapproved origins before any transport call', async () => {
    await expectSafeFailure(await worker.fetch(request(), environment({ DASHBOARD_ORIGIN: 'https://attacker.invalid' })), 503)
    expect(readCompletion).not.toHaveBeenCalled()
  })
})
