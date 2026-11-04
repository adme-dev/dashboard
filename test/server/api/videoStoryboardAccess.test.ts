import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireStoryboardProjectIn } from '~~/server/utils/video-storyboard/access'
import { requireStoryboardEnabled } from '~~/server/utils/video-storyboard/policy'

const actor = { id: 'actor', role: 'member' }
afterEach(() => vi.unstubAllEnvs())
describe('storyboard authorization and flag', () => {
  it('denies unauthorized reads including historical access', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'project', created_by: 'other', media_type: 'av' }] })
    await expect(requireStoryboardProjectIn({ query }, 'project', actor)).rejects.toMatchObject({ statusCode: 403 })
    expect(query.mock.calls[0][0]).not.toContain('FOR UPDATE')
  })
  it('locks only a write authorization and requires AV', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'project', created_by: actor.id, media_type: 'av', client_id: null }] })
    expect(await requireStoryboardProjectIn({ query }, 'project', actor, true)).toMatchObject({ id: 'project' })
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE')
    query.mockResolvedValue({ rows: [{ created_by: actor.id, media_type: 'audio' }] })
    await expect(requireStoryboardProjectIn({ query }, 'project', actor)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('defaults off and gives deployed bindings precedence over local env', () => {
    vi.stubEnv('VIDEO_STORYBOARD_ENABLED', '')
    expect(() => requireStoryboardEnabled({ context: {} } as never)).toThrow()
    vi.stubEnv('VIDEO_STORYBOARD_ENABLED', 'true')
    expect(() => requireStoryboardEnabled({ context: {} } as never)).not.toThrow()
    expect(() => requireStoryboardEnabled({ context: { cloudflare: { env: { VIDEO_STORYBOARD_ENABLED: 'false' } } } } as never)).toThrow()
  })
})
