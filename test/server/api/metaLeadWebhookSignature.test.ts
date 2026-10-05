import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryRows: vi.fn(), logError: vi.fn(), upsertForm: vi.fn(), acceptLead: vi.fn(), getMetaLeadgen: vi.fn(), resolveClient: vi.fn(), assign: vi.fn(), cachedBinding: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryRows: mocks.queryRows }))
vi.mock('~~/server/utils/leads/db', () => ({ logIngestionError: mocks.logError, upsertFormMetadata: mocks.upsertForm }))
vi.mock('~~/server/utils/leads/acceptance', () => ({ acceptLead: mocks.acceptLead }))
vi.mock('~~/server/utils/leads/autoAssign', () => ({ resolveAssignedAm: mocks.assign }))
vi.mock('~~/server/utils/leads/metaLeadClient', () => ({ resolveMetaLeadClient: mocks.resolveClient }))
vi.mock('~~/server/utils/email', () => ({ getCachedBinding: mocks.cachedBinding }))
vi.mock('~~/server/utils/metaClient', async importOriginal => ({ ...await importOriginal<typeof import('~~/server/utils/metaClient')>(), getMetaLeadgen: mocks.getMetaLeadgen }))

const leadId = '1760233211899224'
const rawBody = JSON.stringify({ object: 'page', entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: leadId, form_id: 'form-1' } }] }] })
const event = { context: { cloudflare: { env: { META_APP_SECRET: 'request-secret' } } } }
let signature = ''
async function handler() {
  return (await import('~~/server/api/leads/webhook/meta.post')).default
}

describe('Meta lead webhook authentication and source identity', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('META_APP_SECRET', '')
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('useRuntimeConfig', () => ({ metaAppSecret: '' }))
    vi.stubGlobal('getRequestHeaders', () => ({ 'x-hub-signature-256': signature }))
    vi.stubGlobal('readRawBody', vi.fn(async () => rawBody))
    signature = 'sha256=' + createHmac('sha256', 'request-secret').update(rawBody).digest('hex')
    mocks.queryRows.mockResolvedValue([{ id: 'connection-1', access_token: 'test-token' }])
    mocks.logError.mockResolvedValue(undefined)
    mocks.upsertForm.mockResolvedValue(undefined)
    mocks.assign.mockResolvedValue(null)
    mocks.resolveClient.mockResolvedValue({ client_id: 'client-1', lead_capture_mode: 'capture_only' })
    mocks.getMetaLeadgen.mockResolvedValue({ id: leadId, form_id: 'form-1', field_data: [{ name: 'email', values: ['test@example.test'] }] })
    mocks.acceptLead.mockResolvedValue({ status: 'created', leadId: 'stored-1' })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses request Cloudflare secret when build config is empty and preserves source lead ID', async () => {
    await expect((await handler())(event as never)).resolves.toEqual({ ok: true })
    expect(mocks.acceptLead).toHaveBeenCalledWith(event, expect.objectContaining({ lead: expect.objectContaining({ source_lead_id: leadId, client_id: 'client-1' }) }))
  })

  it('rejects a bad signature before Graph or database access even when build config is empty', async () => {
    signature = 'sha256=' + '0'.repeat(64)
    await expect((await handler())(event as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.queryRows).not.toHaveBeenCalled()
    expect(mocks.getMetaLeadgen).not.toHaveBeenCalled()
  })

  it('fails closed when the app secret is unavailable', async () => {
    await expect((await handler())({ context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('rejects a missing signature', async () => {
    signature = ''
    await expect((await handler())(event as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('rejects a tampered body signed for the original content', async () => {
    vi.mocked(readRawBody).mockResolvedValue(rawBody.replace('page-1', 'page-2'))
    await expect((await handler())(event as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('does not acknowledge an empty request as received', async () => {
    vi.mocked(readRawBody).mockResolvedValue(undefined)
    await expect((await handler())(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })

  it('does not silently acknowledge a request body read failure', async () => {
    vi.mocked(readRawBody).mockRejectedValue(new Error('body unavailable'))
    await expect((await handler())(event as never)).rejects.toThrow('body unavailable')
    expect(mocks.queryRows).not.toHaveBeenCalled()
  })
})
