import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ machine: vi.fn(), verify: vi.fn(), update: vi.fn(), stream: vi.fn(), header: vi.fn(), setHeader: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<object>(), getHeader: mocks.header, getRequestWebStream: mocks.stream, setHeader: mocks.setHeader }))
vi.mock('~~/server/utils/pageStudio/machineAuth', () => ({ requirePageStudioMachineAuth: mocks.machine }))
vi.mock('~~/server/utils/pageStudio/aiUsage', () => ({ updatePageStudioAiUsage: mocks.update }))
vi.mock('~~/server/utils/pageStudio/sessions', async original => ({
  ...await original<object>(), verifyPageStudioSessionToken: mocks.verify,
  resolvePageStudioSessionEnvironment: () => ({ issuer: 'https://dashboard.test' }),
  resolvePageStudioSessionPublicKey: () => 'public-key'
}))
vi.mock('~~/server/utils/pageStudio/http', () => ({
  pageStudioInternalHttpError: (_event: unknown, error: unknown) => { throw error }
}))
const body = { action: 'reserve', operationId: 'candidate:model:1', fingerprint: 'a'.repeat(64), kind: 'model' }
function stream(raw = JSON.stringify(body)) {
  return new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(raw))
    controller.close()
  } })
}
describe('native AI usage endpoint', () => {
  const event = { context: { cloudflare: { env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' } } } }
  const call = async () => (await import('~~/server/routes/internal/page-studio/ai-usage.post')).default(event as never)
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.header.mockImplementation((_event, key) => key === 'x-page-studio-session' ? 'signed-token' : key === 'content-type' ? 'application/json' : undefined)
    mocks.stream.mockImplementation(() => stream())
    mocks.verify.mockResolvedValue({ nonce: 'native-identity' })
    mocks.update.mockResolvedValue({ admitted: true })
  })
  it('requires gateway credentials before token, body or budget access', async () => {
    mocks.machine.mockImplementation(() => {
      throw Object.assign(new Error('Denied'), { statusCode: 401 })
    })
    await expect(call()).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.stream).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('forwards only verified identity and bound environment with no-store', async () => {
    await expect(call()).resolves.toEqual({ admitted: true })
    expect(mocks.verify).toHaveBeenCalledWith('signed-token', 'public-key', 'https://dashboard.test')
    expect(mocks.update).toHaveBeenCalledWith(body, { nonce: 'native-identity' }, 'staging')
    expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'no-store')
  })
  it('rejects a missing signed editor token before reading the body', async () => {
    mocks.header.mockReturnValue(undefined)
    await expect(call()).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it('rejects oversized streamed bytes even without Content-Length', async () => {
    mocks.stream.mockImplementation(() => stream(' '.repeat(4097)))
    await expect(call()).rejects.toMatchObject({ statusCode: 413 })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it.each([{ ...body, amount: 0 }, { ...body, environment: 'production' }, { ...body, userId: 'forged' }])('rejects authored authority or amounts %#', async (value) => {
    mocks.stream.mockImplementation(() => stream(JSON.stringify(value)))
    await expect(call()).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('propagates revocation and exhausted budget without retry', async () => {
    mocks.update.mockRejectedValue(Object.assign(new Error('Denied'), { statusCode: 403 }))
    await expect(call()).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })
})
