import { beforeEach, expect, it, vi } from 'vitest'
import { handleStudioComponentCmsData } from '~~/server/utils/pageStudio/componentCmsDataHttp'

const mocks = vi.hoisted(() => ({
  machine: vi.fn(),
  verify: vi.fn(),
  read: vi.fn(),
  header: vi.fn(),
  stream: vi.fn(),
  setHeader: vi.fn()
}))
vi.mock('h3', async original => ({
  ...(await original<object>()),
  getHeader: mocks.header,
  getRequestWebStream: mocks.stream,
  setHeader: mocks.setHeader
}))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({
  requirePageStudioMachineAuth: mocks.machine
}))
vi.mock('~~/server/utils/pageStudio/componentCmsData', async original => ({
  ...await original<object>(), readAcceptedComponentCmsData: mocks.read
}))
vi.mock('~~/server/utils/pageStudio/sessions', () => ({
  verifyPageStudioSessionToken: mocks.verify,
  resolvePageStudioSessionEnvironment: () => ({ issuer: 'native' }),
  resolvePageStudioSessionPublicKey: () => 'key'
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioInternalHttpError: (_event: unknown, error: unknown) => {
    throw error
  }
}))
const request = { pin: { kind: 'component', id: 'fleet_view', version: 1, sha256: 'a'.repeat(64) } }
const event = { context: { cloudflare: { env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' } } } }
function body(raw: string) {
  mocks.stream.mockImplementation(
    () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(raw))
          controller.close()
        }
      })
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.header.mockImplementation((_event, name) =>
    name === 'x-page-studio-session'
      ? 'real-child'
      : name === 'content-type'
        ? 'application/json'
        : null
  )
  mocks.verify.mockResolvedValue({
    siteId: 'actual-site',
    clientId: 'actual-client',
    nonce: 'actual-child'
  })
  mocks.read.mockResolvedValue({ version: 1, actions: [] })
  body(JSON.stringify(request))
})
it('derives the existing verified child principal without model invocation authority', async () => {
  expect(await handleStudioComponentCmsData(event as never)).toEqual({ version: 1, actions: [] })
  expect(mocks.machine).toHaveBeenCalledWith(event)
  expect(mocks.read).toHaveBeenCalledWith(request, {
    source: 'studio-session',
    claims: { siteId: 'actual-site', clientId: 'actual-client', nonce: 'actual-child' },
    env: event.context.cloudflare.env,
    capability: 'workspace:checkpoint'
  })
  expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store')
})
it.each(['{"scope":{}}', '{"actor":"admin"}', '{"actionPin":{}}'])(
  'rejects browser authority selectors: %s',
  async (raw) => {
    body(raw)
    await expect(handleStudioComponentCmsData(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.read).not.toHaveBeenCalled()
  }
)
it('bounds the actual request stream', async () => {
  body(' '.repeat(4097))
  await expect(handleStudioComponentCmsData(event as never)).rejects.toMatchObject({ statusCode: 413 })
  expect(mocks.read).not.toHaveBeenCalled()
})
it('denies failed machine or child authentication before private discovery', async () => {
  mocks.machine.mockImplementationOnce(() => {
    throw new Error('Machine denied')
  })
  await expect(handleStudioComponentCmsData(event as never)).rejects.toThrow('Machine denied')
  mocks.verify.mockRejectedValueOnce(new Error('Child revoked'))
  await expect(handleStudioComponentCmsData(event as never)).rejects.toThrow('Child revoked')
  expect(mocks.read).not.toHaveBeenCalled()
})
