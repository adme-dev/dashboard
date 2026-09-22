import { beforeEach, expect, it, vi } from 'vitest'
import { handlePublishedFormAction } from '~~/server/utils/pageStudio/publicActionHttp'

const mocks = vi.hoisted(() => ({ admit: vi.fn(), acknowledge: vi.fn(), complete: vi.fn(), recover: vi.fn(), header: vi.fn(), stream: vi.fn(), setHeader: vi.fn(), status: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<object>(), getHeader: mocks.header, getRequestWebStream: mocks.stream, setHeader: mocks.setHeader, setResponseStatus: mocks.status }))
vi.mock('~~/server/utils/pageStudio/publicActionInvocations', async original => ({
  ...await original<object>(), admitPublishedFormAction: mocks.admit, acknowledgePublishedFormAction: mocks.acknowledge,
  completePublishedFormAction: mocks.complete, recoverPublishedFormAction: mocks.recover
}))
const request = {
  version: 1, publication: { hostname: 'fixture.example.com', releaseId: '30000000-0000-4000-8000-000000000003', activationId: '30000000-0000-4000-8000-000000000004', pointerVersion: 1, buildId: 'build_a', versionDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), sealDigest: 'c'.repeat(64), pageRoute: '/' },
  pageId: 'home', formId: 'enquiry', formDigest: 'd'.repeat(64), intentId: '30000000-0000-4000-8000-000000000005', receiptSecret: 'e'.repeat(64), clientAddress: '192.0.2.10', fields: { title: 'private visitor input' }, turnstileToken: 'private challenge'
}
const recovery = { ...request, fields: undefined, turnstileToken: undefined, fieldsDigest: 'f'.repeat(64) }
const event = { context: { cloudflare: { env: { PAGE_STUDIO_CONTROL_SECRET: 'machine-only-test-secret' } } } }
function body(value: unknown) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  mocks.stream.mockImplementation(() => new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(raw))
    controller.close()
  } }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.header.mockImplementation((_event, name) => ({ 'authorization': 'Bearer machine-only-test-secret', 'content-type': 'application/json' }[name as string] ?? null))
  for (const phase of ['admit', 'acknowledge', 'complete', 'recover'] as const) mocks[phase].mockResolvedValue({ phase })
  body({ phase: 'admit', request })
})
it.each(['admit', 'acknowledge', 'complete', 'recover'] as const)('routes machine-authenticated %s to its native composition', async (phase) => {
  const input = phase === 'admit' ? request : JSON.parse(JSON.stringify(recovery))
  body({ phase, request: input })
  expect(await handlePublishedFormAction(event as never)).toEqual({ phase })
  expect(mocks[phase]).toHaveBeenCalledWith(input, event.context.cloudflare.env)
  expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
})
it.each([null, 'Bearer browser-session', 'Basic machine-only-test-secret'])('rejects non-machine credentials %s before reading the body', async (authorization) => {
  mocks.header.mockImplementation((_event, name) => name === 'authorization' ? authorization : name === 'x-page-studio-session' ? 'creator-session' : 'application/json')
  expect(await handlePublishedFormAction(event as never)).toEqual({ error: { code: 'PUBLIC_ACTION_REQUEST_FAILED', message: 'Published form action unavailable' } })
  expect(mocks.status.mock.calls[0]![1]).toBe(authorization === 'Bearer browser-session' ? 403 : 401)
  expect(mocks.stream).not.toHaveBeenCalled()
  expect(mocks.admit).not.toHaveBeenCalled()
})
it.each(['actor', 'scope', 'environment', 'dispatchGranted', 'runtimeDigest', 'result'])('rejects caller-selected %s', async (field) => {
  body({ phase: 'admit', request: { ...request, [field]: 'forged' } })
  await handlePublishedFormAction(event as never)
  expect(mocks.status).toHaveBeenCalledWith(event, 400)
  expect(mocks.admit).not.toHaveBeenCalled()
})
it.each(['unknown-phase', 'recovery-admission', 'input-recovery', 'extra-envelope'])('rejects %s without calling a coordinator', async (mode) => {
  body(mode === 'unknown-phase' ? { phase: 'execute', request } : mode === 'recovery-admission' ? { phase: 'admit', request: recovery } : mode === 'input-recovery' ? { phase: 'recover', request } : { phase: 'admit', request, actor: 'publisher' })
  await handlePublishedFormAction(event as never)
  expect(mocks.status).toHaveBeenCalledWith(event, 400)
  for (const phase of ['admit', 'acknowledge', 'complete', 'recover'] as const) expect(mocks[phase]).not.toHaveBeenCalled()
})
it('enforces observed bytes without a Content-Length header', async () => {
  body(' '.repeat(80_001))
  await handlePublishedFormAction(event as never)
  expect(mocks.status).toHaveBeenCalledWith(event, 413)
  expect(mocks.admit).not.toHaveBeenCalled()
})
it('does not include raw input, tokens or backend errors in responses or logs', async () => {
  const error = new Error(JSON.stringify(request)), log = vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.admit.mockRejectedValue(error)
  try {
    expect(await handlePublishedFormAction(event as never)).toEqual({ error: { code: 'PUBLIC_ACTION_REQUEST_FAILED', message: 'Published form action unavailable' } })
    expect(mocks.status).toHaveBeenCalledWith(event, 500)
    expect(log.mock.calls).toEqual([['[page-studio-public-action] request failed', { statusCode: 500 }]])
  } finally { log.mockRestore() }
})
