import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
const access = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: access }))
vi.mock('~~/server/utils/video/assetLinks', () => ({ videoAssetPublicUrl: async (id: string) => `https://app.test/api/public/video-assets/signed-${id}` }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.test' }))
import { createBannerSocialDraft, parseBannerSocialSuggestion } from '../../server/utils/banner/socialDraft'
const projectId = '22222222-2222-4222-8222-222222222222'
const jobId = '11111111-1111-4111-8111-111111111111'
function fixture(overrides = {}, existing?: { id: string; client_id: string }) {
  const job = { id: jobId, project_id: projectId, client_id: 'client-a', status: 'done', r2_key: `banner-videos/${projectId}/mrec_${jobId}.mp4`, width: 300, height: 250, quality: 1, name: 'Banner', format_key: 'mrec', ...overrides }
  const head = vi.fn(async () => ({ size: 123 }))
  const db = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('FROM banner_render_jobs') ? [job] : sql.includes('SELECT id, client_id FROM social_posts') ? (existing ? [existing] : []) : sql.includes('INSERT INTO social_posts') ? [{ id: 'post-id' }] : [] })) }
  const event = { context: { cloudflare: { env: { MEDIA_BUCKET: { head } } } } } as unknown as H3Event
  return { db, head, event, run: () => createBannerSocialDraft(event, jobId, 'actor', db as any) }
}
beforeEach(() => access.mockReset())
describe('Banner render to social draft', () => {
  it('creates a draft with signed media, exact dimensions, provenance and mandatory audit', async () => {
    const f = fixture()
    expect(await f.run()).toEqual({ id: 'post-id', postId: 'post-id', clientId: 'client-a' })
    expect(access).toHaveBeenCalledWith(f.event, 'client-a')
    const writes = f.db.query.mock.calls as unknown as Array<[string, any[]]>
    const insert = writes.find(([sql]) => sql.includes('INSERT INTO social_posts'))!
    expect(insert[0]).toContain("'draft'")
    expect(insert[1][2][0]).toContain('/api/public/video-assets/')
    expect(JSON.parse(insert[1][3])).toMatchObject({ source: 'banner_studio', renderJobId: jobId, width: 300, height: 250 })
    expect(writes.find(([sql]) => sql.includes('INSERT INTO video_assets'))![1][7]).toBe('6:5')
    expect(writes.at(-1)![0]).toContain('social_publishing_audit_events')
  })
  it('accepts a fenced render attempt object key for the normal social handoff', async () => {
    const f = fixture({ r2_key: `banner-videos/${projectId}/${jobId}-33333333-3333-4333-8333-333333333333.mp4` })
    expect((await f.run()).postId).toBe('post-id')
    expect(f.head).toHaveBeenCalledOnce()
  })
  it('reuses an existing draft without creating assets or writing another post', async () => {
    const f = fixture({}, { id: 'already-published', client_id: 'client-a' })
    expect((await f.run()).postId).toBe('already-published')
    expect(f.head).not.toHaveBeenCalled()
    expect(f.db.query).toHaveBeenCalledTimes(2)
  })
  it('blocks a client mismatch on an existing post', async () => {
    await expect(fixture({}, { id: 'existing', client_id: 'client-b' }).run()).rejects.toMatchObject({ statusCode: 409 })
  })
  it('blocks users without access before checking storage or writing', async () => {
    access.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    const f = fixture()
    await expect(f.run()).rejects.toMatchObject({ statusCode: 403 })
    expect(f.db.query).toHaveBeenCalledTimes(1)
    expect(f.head).not.toHaveBeenCalled()
  })
  it.each([{ client_id: null }, { status: 'rendering' }, { r2_key: `banner-videos/${projectId}/../other.mp4` }, { r2_key: 'banner-videos/other/video.mp4' }])('rejects unavailable or unsafe render %j', async override => {
    const f = fixture(override)
    await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
    expect(f.head).not.toHaveBeenCalled()
  })
  it('does not insert when rendered bytes are missing', async () => {
    const f = fixture()
    f.head.mockResolvedValueOnce(null as any)
    await expect(f.run()).rejects.toMatchObject({ statusCode: 409 })
    expect(f.db.query).toHaveBeenCalledTimes(2)
  })
  it('fails if the required audit cannot be recorded', async () => {
    const f = fixture()
    const query = f.db.query.getMockImplementation()!
    f.db.query.mockImplementation(async sql => {
      if (sql.includes('social_publishing_audit_events')) throw new Error('audit unavailable')
      return query(sql)
    })
    await expect(f.run()).rejects.toThrow('audit unavailable')
  })
})


describe('Banner assistant social suggestion handoff', () => {
  it('saves copy and timing as a draft suggestion, never a scheduled publication', async () => {
    const f = fixture()
    await createBannerSocialDraft(f.event, jobId, 'actor', f.db as never, { caption: 'Reviewed copy', suggestedSchedule: 'Next month at 10am Melbourne' })
    const writes = f.db.query.mock.calls as unknown as Array<[string, unknown[]]>
    const insert = writes.find(([sql]) => sql.includes('INSERT INTO social_posts'))!
    expect(insert[0]).toContain("'draft'")
    expect(insert[0]).not.toContain('scheduled_at')
    expect(insert[1][4]).toBe('Reviewed copy')
    expect(JSON.parse(insert[1][3] as string).bannerSuggestedSchedule).toBe('Next month at 10am Melbourne')
  })
  it('does not overwrite an existing post when reopening an export', async () => {
    const f = fixture({}, { id: 'existing', client_id: 'client-a' })
    await createBannerSocialDraft(f.event, jobId, 'actor', f.db as never, { caption: 'Different copy' })
    expect(f.db.query).toHaveBeenCalledTimes(2)
  })
  it('bounds and normalizes suggestions', () => {
    expect(parseBannerSocialSuggestion({ caption: ' Hello ', suggestedSchedule: ' Tomorrow ' })).toEqual({ caption: 'Hello', suggestedSchedule: 'Tomorrow' })
    expect(() => parseBannerSocialSuggestion({ caption: 'x'.repeat(5001) })).toThrow()
    expect(() => parseBannerSocialSuggestion({ suggestedSchedule: {} })).toThrow()
  })
})
