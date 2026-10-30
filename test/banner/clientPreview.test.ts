import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ one: vi.fn(), rows: vi.fn(), headers: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.one, queryRowsFresh: mocks.rows }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', (event: { token: string }) => event.token)
vi.stubGlobal('setHeader', mocks.headers)
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options))

const { default: preview } = await import('../../server/api/public/banner-share/[token].get')
const token = `p_${'a'.repeat(32)}`
const project = { id: 'project', name: 'Client creative', canvasData: { custom_1200x1200: { layers: [{ fontFamily: 'Managed Font' }] } } }

beforeEach(() => {
  mocks.one.mockReset()
  mocks.rows.mockReset()
  mocks.headers.mockReset()
})

describe('view-only client banner preview', () => {
  it('rejects legacy review tokens before reading project data', async () => {
    await expect(preview({ token: 'a'.repeat(32) } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.one).not.toHaveBeenCalled()
  })

  it('rejects revoked and expired links before reading the canvas', async () => {
    mocks.one.mockResolvedValueOnce({ projectId: 'project', revoked: true, expiresAt: '2099-01-01' })
    await expect(preview({ token } as never)).rejects.toMatchObject({ statusCode: 410 })
    mocks.one.mockResolvedValueOnce({ projectId: 'project', revoked: false, expiresAt: '2020-01-01' })
    await expect(preview({ token } as never)).rejects.toMatchObject({ statusCode: 410 })
    expect(mocks.one).toHaveBeenCalledTimes(2)
  })

  it('returns artwork and used fonts without comments or reviewer identities', async () => {
    mocks.one.mockResolvedValueOnce({ projectId: 'project', revoked: false, expiresAt: '2099-01-01' }).mockResolvedValueOnce(project)
    mocks.rows.mockResolvedValueOnce([{ name: 'Managed Font', url: 'https://cdn.example/font.woff2', tags: ['font', 'weight:700', 'format:woff2'] }])
    const result = await preview({ token } as never)
    expect(result).toMatchObject({ project, fonts: [{ name: 'Managed Font' }] })
    expect(result).not.toHaveProperty('comments')
    expect(JSON.stringify(result)).not.toContain('reviewerEmail')
    expect(mocks.rows.mock.calls[0]?.[1]).toEqual([['Managed Font']])
    expect(mocks.headers).toHaveBeenCalledWith(expect.anything(), 'Cache-Control', 'no-store')
  })
})
