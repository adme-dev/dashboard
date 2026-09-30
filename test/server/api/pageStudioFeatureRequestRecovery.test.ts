import { beforeEach, expect, it, vi } from 'vitest'
import handler from '~~/server/routes/internal/page-studio/features/requests.post'

const mocks = vi.hoisted(() => ({ machine: vi.fn(), verify: vi.fn(), update: vi.fn(), header: vi.fn(), stream: vi.fn(), setHeader: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<object>(), getHeader: mocks.header, getRequestWebStream: mocks.stream, setHeader: mocks.setHeader }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.machine }))
vi.mock('~~/server/utils/pageStudio/featureRequestRecovery', () => ({ updatePageStudioFeatureRequest: mocks.update }))
vi.mock('~~/server/utils/pageStudio/sessions', () => ({
  verifyPageStudioSessionToken: mocks.verify,
  resolvePageStudioSessionEnvironment: () => ({ issuer: 'native' }),
  resolvePageStudioSessionPublicKey: () => 'key'
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({ pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
  throw error
} }))
const event = { context: { cloudflare: { env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' } } } }
const claims = { userId: 'verified-actor', siteId: 'verified-site', role: 'client' }
function body(raw: string) {
  mocks.stream.mockImplementation(() => new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(raw))
    controller.close()
  } }))
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.header.mockImplementation((_event, name) => name === 'x-page-studio-session' ? 'signed-child' : name === 'content-type' ? 'application/json' : null)
  mocks.verify.mockResolvedValue(claims)
  mocks.update.mockResolvedValue({ pending: null, claimed: false })
  body('{"operation":"read"}')
})
it('binds discovery to the signed actor and deployment environment with no-store', async () => {
  expect(await handler(event as never)).toEqual({ pending: null, claimed: false })
  expect(mocks.update).toHaveBeenCalledWith({ operation: 'read' }, claims, 'staging')
  expect(mocks.machine).toHaveBeenCalledWith(event)
  expect(mocks.verify).toHaveBeenCalledWith('signed-child', 'key', 'native')
  expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
})
it('bounds the actual body before invoking recovery', async () => {
  body(' '.repeat(4097))
  await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 413 })
  expect(mocks.update).not.toHaveBeenCalled()
})
it('denies failed machine or child authentication before discovery', async () => {
  mocks.machine.mockImplementationOnce(() => {
    throw new Error('Machine denied')
  })
  await expect(handler(event as never)).rejects.toThrow('Machine denied')
  mocks.verify.mockRejectedValueOnce(new Error('Child revoked'))
  await expect(handler(event as never)).rejects.toThrow('Child revoked')
  expect(mocks.update).not.toHaveBeenCalled()
})
