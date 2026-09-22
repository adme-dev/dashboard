import { beforeEach, expect, it, vi } from 'vitest'
import { handlePublishedFeaturePage } from '~~/server/utils/pageStudio/publishedFeatureHttp'

const mocks = vi.hoisted(() => ({ machine: vi.fn(), read: vi.fn(), header: vi.fn(), stream: vi.fn(), setHeader: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<object>(), getHeader: mocks.header, getRequestWebStream: mocks.stream, setHeader: mocks.setHeader }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.machine }))
vi.mock('~~/server/utils/pageStudio/publishedFeatureProjection', () => ({ readPublishedFeaturePage: mocks.read }))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
  throw error
} }))
const request = { hostname: 'fixture.example.com', releaseId: '30000000-0000-4000-8000-000000000003', buildId: 'build_a', versionDigest: 'a'.repeat(64), manifestDigest: 'b'.repeat(64), sealDigest: 'c'.repeat(64), pageRoute: '/' }
const event = { context: { cloudflare: { env: { PAGE_STUDIO_ACTION_RUNTIME_DIGEST: 'host-runtime' } } } }
function body(raw: string) {
  mocks.stream.mockImplementation(() => new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(raw))
    controller.close()
  } }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.header.mockImplementation((_event, name) => name === 'content-type' ? 'application/json' : null)
  mocks.read.mockResolvedValue({ version: 1 })
  body(JSON.stringify(request))
})
it('uses private machine authority without requiring a publisher session', async () => {
  expect(await handlePublishedFeaturePage(event as never)).toEqual({ version: 1 })
  expect(mocks.machine).toHaveBeenCalledWith(event)
  expect(mocks.read).toHaveBeenCalledWith(request, event.context.cloudflare.env)
  expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
})
it.each(['actor', 'contentScope', 'environment', 'recoveryKey'])('rejects browser-selected %s', async (key) => {
  body(JSON.stringify({ ...request, [key]: 'forged' }))
  await expect(handlePublishedFeaturePage(event as never)).rejects.toMatchObject({ statusCode: 400 })
  expect(mocks.read).not.toHaveBeenCalled()
})
it('requires authenticated machine ingress before private recovery', async () => {
  mocks.machine.mockImplementation(() => {
    throw new Error('Machine denied')
  })
  await expect(handlePublishedFeaturePage(event as never)).rejects.toThrow('Machine denied')
  expect(mocks.read).not.toHaveBeenCalled()
})
it('bounds the actual request stream', async () => {
  body(' '.repeat(4097))
  await expect(handlePublishedFeaturePage(event as never)).rejects.toMatchObject({ statusCode: 413 })
})
