import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handlePageStudioImageWorker, handlePageStudioImageEditor } from '~~/server/utils/pageStudio/imageInternalHttp'

const mocks = vi.hoisted(() => ({ worker: vi.fn(), editor: vi.fn(), verify: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/imageWorkerService', async original => ({ ...await original<typeof import('~~/server/utils/pageStudio/imageWorkerService')>(), executeImageWorkerOperation: mocks.worker }))
vi.mock('~~/server/utils/pageStudio/imageGenerationService', async original => ({ ...await original<typeof import('~~/server/utils/pageStudio/imageGenerationService')>(), executeStudioImageOperation: mocks.editor }))
vi.mock('~~/server/utils/pageStudio/sessions', async original => ({ ...await original<typeof import('~~/server/utils/pageStudio/sessions')>(), verifyPageStudioSessionToken: mocks.verify, resolvePageStudioSessionPublicKey: () => 'test-public-key', resolvePageStudioSessionEnvironment: () => ({ issuer: 'test-issuer' }) }))
const env = { PAGE_STUDIO_CONTROL_SECRET: 'c'.repeat(40), PAGE_STUDIO_IMAGE_WORKER_SECRET: 'w'.repeat(40) }
const scope = { tenantId: 'image_test', clientId: '10000000-0000-4000-8000-000000000001', businessId: '10000000-0000-4000-8000-000000000001', siteId: '30000000-0000-4000-8000-000000000003', environment: 'staging' }
const jobId = '20000000-0000-4000-8000-000000000002'
const claims = { userId: 'editor', siteId: scope.siteId }
function request(kind: 'worker' | 'editor', body: unknown, headers: Record<string, string> = {}, config: Record<string, unknown> = env) {
  const app = createApp().use((event) => {
    event.context.cloudflare = { env: config }
    return kind === 'worker' ? handlePageStudioImageWorker(event, 'claim') : handlePageStudioImageEditor(event, 'generate')
  })
  return toWebHandler(app)(new Request('https://native.test/internal/page-studio/images/claim', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))
}
describe('private image transport boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.worker.mockResolvedValue({ admitted: false })
    mocks.editor.mockResolvedValue({ job: { jobId } })
    mocks.verify.mockResolvedValue(claims)
  })
  it('requires the dedicated worker credential in addition to gateway authentication', async () => {
    for (const headers of [{}, { authorization: `Bearer ${env.PAGE_STUDIO_CONTROL_SECRET}` }, { 'authorization': `Bearer ${env.PAGE_STUDIO_CONTROL_SECRET}`, 'x-page-studio-image-worker': 'wrong' }]) {
      expect([401, 403]).toContain((await request('worker', { scope, jobId }, headers)).status)
    }
    expect(mocks.worker).not.toHaveBeenCalled()
  })
  it('fails closed on missing or short worker credential configuration', async () => {
    for (const secret of [undefined, 'short']) {
      expect((await request('worker', { scope, jobId }, { 'authorization': `Bearer ${env.PAGE_STUDIO_CONTROL_SECRET}`, 'x-page-studio-image-worker': 'short' }, { ...env, PAGE_STUDIO_IMAGE_WORKER_SECRET: secret })).status).toBe(503)
    }
    expect(mocks.worker).not.toHaveBeenCalled()
  })
  it('admits bounded worker commands with no-store and closed payloads', async () => {
    const headers = { 'authorization': `Bearer ${env.PAGE_STUDIO_CONTROL_SECRET}`, 'x-page-studio-image-worker': env.PAGE_STUDIO_IMAGE_WORKER_SECRET }
    const response = await request('worker', { scope, jobId }, headers)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.worker).toHaveBeenCalledWith(env, 'claim', { scope, jobId })
    expect((await request('worker', { scope, jobId, prompt: 'forged' }, headers)).status).toBe(400)
    expect((await request('worker', { scope, jobId, padding: 'x'.repeat(17000) }, headers)).status).toBe(413)
    expect(mocks.worker).toHaveBeenCalledTimes(1)
  })
  it('requires a verified signed editor session, even with gateway access', async () => {
    const headers = { authorization: `Bearer ${env.PAGE_STUDIO_CONTROL_SECRET}` }
    expect((await request('editor', { quoteId: jobId }, headers)).status).toBe(401)
    expect(mocks.editor).not.toHaveBeenCalled()
    expect((await request('editor', { quoteId: jobId }, { ...headers, 'x-page-studio-session': 'signed-token' })).status).toBe(200)
    expect(mocks.verify).toHaveBeenCalledWith('signed-token', 'test-public-key', 'test-issuer')
    expect(mocks.editor).toHaveBeenCalledWith(claims, env, 'generate', { quoteId: jobId })
  })
  it('rejects forged editor scope, price and dispatch credentials before service access', async () => {
    const headers = { 'authorization': `Bearer ${env.PAGE_STUDIO_CONTROL_SECRET}`, 'x-page-studio-session': 'signed-token' }
    for (const extra of [{ scope }, { credits: 0 }, { dispatchToken: jobId }]) {
      expect((await request('editor', { quoteId: jobId, ...extra }, headers)).status).toBe(400)
    }
    expect(mocks.editor).not.toHaveBeenCalled()
  })
})
