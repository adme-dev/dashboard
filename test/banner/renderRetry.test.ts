import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), execute: vi.fn(), access: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query, execute: mocks.execute }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access, hasAllSocialClientAccess: () => false, isSocialClientId: () => true }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
const handler = (await import('~~/server/api/agency/banner-studio/export-video/jobs/[id]/retry.post')).default
const id = '11111111-1111-4111-8111-111111111111'
const row = { status: 'failed', updated_at: '2026-01-01', client_id: 'client', created_by: 'user', source_r2_key: 'source' }
const send = vi.fn(), head = vi.fn()
const event = () => ({ context: { params: { id }, cloudflare: { env: { BANNER_RENDER_QUEUE: { send }, MEDIA_BUCKET: { head } } } } }) as unknown as H3Event
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'user' })
  head.mockResolvedValue({ size: 100 })
  mocks.query.mockResolvedValueOnce(row).mockResolvedValueOnce({ id })
})
describe('same-job retry', () => {
  it('authorizes the persisted client, reserves once and sends only the original ID', async () => {
    await expect(handler(event())).resolves.toEqual({ jobId: id, status: 'queued' })
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'client')
    expect(send).toHaveBeenCalledExactlyOnceWith({ jobId: id })
    expect(mocks.query.mock.calls[1]?.[0]).toContain('UPDATE banner_render_jobs')
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([id])
  })
  it('never queues on lost reservation or changed state', async () => {
    mocks.query.mockReset().mockResolvedValueOnce(row).mockResolvedValueOnce(null)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 409 })
    expect(send).not.toHaveBeenCalled()
  })
  it.each(['rendering', 'done'])('refuses %s jobs', async (status) => {
    mocks.query.mockReset().mockResolvedValueOnce({ ...row, status, updated_at: new Date().toISOString() })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 409 })
    expect(send).not.toHaveBeenCalled()
    expect(head).not.toHaveBeenCalled()
  })
  it('recovers an expired rendering lease using the original job ID', async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ ...row, status: 'rendering' }).mockResolvedValueOnce({ id })
    await expect(handler(event())).resolves.toEqual({ jobId: id, status: 'queued' })
    expect(send).toHaveBeenCalledExactlyOnceWith({ jobId: id })
    expect(mocks.query.mock.calls[1]?.[0]).toContain('status IN (\'queued\', \'rendering\')')
  })
  it('refuses missing source and unauthorized clients before reserving', async () => {
    head.mockResolvedValue(null)
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 410 })
    expect(send).not.toHaveBeenCalled()
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('WHERE id=$1 AND status IN (\'queued\', \'rendering\')'), [id, expect.stringContaining('no longer available')])
    mocks.query.mockReset().mockResolvedValueOnce(row)
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).toHaveBeenCalledOnce()
  })
  it('retains uncertain send failures on the original queued job', async () => {
    send.mockRejectedValue(new Error('queue response lost'))
    await expect(handler(event())).rejects.toThrow('queue response lost')
    expect(send).toHaveBeenCalledOnce()
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('AND status = \'queued\''), [id, true, expect.stringContaining('may still render')])
  })
})
