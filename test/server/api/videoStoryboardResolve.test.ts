import { beforeEach, describe, expect, it, vi } from 'vitest'
import route from '~~/server/api/agency/video/projects/[id]/storyboard/resolve.post'
import { id } from '../../video/fixtures/storyboard'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), compile: vi.fn(), body: {} as Record<string, unknown> }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), defineEventHandler: (fn: unknown) => fn, readBody: async () => mocks.body, getRouterParam: () => id(2) }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/video-storyboard/resolve', () => ({ resolveStoryboard: mocks.resolve }))
vi.mock('~~/shared/video/storyboardCompile', () => ({ compileStoryboard: mocks.compile }))
const event = { context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'true' } } } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: id(6), role: 'member' })
  mocks.body = { revisionId: id(3), formats: ['reels_9x16'] }
})
describe('storyboard resolution route', () => {
  it('requires authority and feature flag before media preparation', async () => {
    await expect(route({ context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'false' } } } } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.resolve).not.toHaveBeenCalled()
    mocks.auth.mockRejectedValue({ statusCode: 403 })
    await expect(route(event as never)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects client media/approval/obligation fields', async () => {
    mocks.body.assets = { r2Key: 'other-client' }
    await expect(route(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.resolve).not.toHaveBeenCalled()
  })
  it('returns proposed timeline only, keeping obligation authority server-owned', async () => {
    mocks.compile.mockReturnValue({ ok: true, timeline: { tracks: [] }, obligations: { sources: [] }, findings: [] })
    await expect(route(event as never)).resolves.toEqual({ ok: true, timeline: { tracks: [] }, findings: [] })
    expect(mocks.resolve.mock.calls[0][0]).toMatchObject({ projectId: id(2), revisionId: id(3), actor: { id: id(6) } })
  })
})
