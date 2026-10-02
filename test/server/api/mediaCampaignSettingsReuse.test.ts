import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), project: vi.fn(), create: vi.fn(), campaign: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth, requireAuth: mocks.auth }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access }))
vi.mock('~~/server/utils/socialPublishing/campaigns', () => ({ assertSocialCampaign: mocks.campaign }))
vi.mock('~~/server/utils/audio/projects', () => ({ getProjectWithCurrentTimeline: mocks.project, createProjectIn: mocks.create, getProjectWithCurrentTimelineIn: vi.fn() }))
vi.mock('~~/server/utils/audio/godModeMutations', () => ({ executeGodModeMediaProjectCreate: (_event: unknown, mutate: (db: unknown) => unknown) => mutate({ query: mocks.query }) }))
Object.assign(globalThis, {
  defineEventHandler: (handler: unknown) => handler,
  readBody: (event: { body: unknown }) => Promise.resolve(event.body),
  getRouterParam: () => 'source-project',
  setResponseStatus: vi.fn(),
  createError: (value: { statusMessage: string }) => Object.assign(new Error(value.statusMessage), value)
})
const create = (await import('~~/server/api/agency/audio/projects/index.post')).default
const read = (await import('~~/server/api/agency/audio/projects/[id].get')).default
const clientId = 'f7c142a6-a63f-4f75-90aa-700db68c1c76'
const sourceId = 'd860f561-8d03-456c-8565-9a45bda1464e'
const campaignId = '01a60d22-ff86-4501-a0a7-521bc12e4cc9'
const settings = { clientId, campaignId, brief: 'Book a demo', guideRules: 'Keep logo crisp.', prompt: 'Preserve artwork.', socialBrief: 'Introduce DriveAgent. Book a demo.' }
const source = { project: { id: sourceId, clientId, createdBy: 'creator', mediaType: 'av', currentTimelineId: 'timeline-1' }, timeline: { state: { campaign_prompt: settings, tracks: [{ clips: [{ r2_key: 'old-clip.mp4' }] }] } } }
function event(body: Record<string, unknown> = {}) {
  return { body: { title: 'Next video', clientId, mediaType: 'av', campaignSourceProjectId: sourceId, ...body } } as unknown as Parameters<typeof create>[0]
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'creator', role: 'editor' })
  mocks.access.mockResolvedValue({})
  mocks.campaign.mockResolvedValue(undefined)
  mocks.project.mockResolvedValue(source)
  mocks.query.mockImplementation((sql: string) => Promise.resolve({ rows: sql.includes('FROM media_timelines') ? [{ campaign_prompt: settings }] : [{ client_id: clientId, current_timeline_id: 'timeline-1', created_by: 'creator', media_type: 'av' }] }))
  mocks.create.mockImplementation((_db, input) => Promise.resolve({ project: { id: 'new-project', ...input }, timeline: { state: input.initialState } }))
})
describe('reusable video campaign settings', () => {
  it('copies the saved settings into empty AV lanes for the same client', async () => {
    const result = await create(event())
    expect(result.project.clientId).toBe(clientId)
    expect(result.project.mediaType).toBe('av')
    expect(result.timeline.state.campaign_prompt).toEqual(settings)
    expect(result.timeline.state.tracks.every((t: { clips: unknown[] }) => t.clips.length === 0)).toBe(true)
    expect(mocks.campaign).toHaveBeenCalledWith(clientId, campaignId)
  })
  it('reports a deleted source without creating a project', async () => {
    mocks.project.mockResolvedValue(null)
    await expect(create(event())).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('requires a client and rejects an ambiguous seed plus source', async () => {
    await expect(create(event({ clientId: null }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(create(event({ initialState: {} }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.project).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('enforces client access before reading settings', async () => {
    mocks.access.mockRejectedValue(Object.assign(new Error('Client access denied'), { statusCode: 403 }))
    await expect(create(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.project).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects an inaccessible source before copying its guidance', async () => {
    mocks.project.mockResolvedValue({ ...source, project: { ...source.project, createdBy: 'someone-else' } })
    await expect(create(event())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects a source assigned to another client', async () => {
    mocks.project.mockResolvedValue({ ...source, project: { ...source.project, clientId: 'bc8a15a8-f523-4a75-a8f4-a501649bb71d' } })
    await expect(create(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('requires a saved prompt instead of silently creating a blank preset', async () => {
    mocks.project.mockResolvedValue({ ...source, timeline: { state: {} } })
    await expect(create(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects a stale campaign before creating the project', async () => {
    mocks.campaign.mockRejectedValue(Object.assign(new Error('Campaign unavailable'), { statusCode: 400 }))
    await expect(create(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects a source reassigned while creation is in flight', async () => {
    mocks.query.mockResolvedValue({ rows: [{ client_id: null, current_timeline_id: 'timeline-1', created_by: 'creator', media_type: 'av' }] })
    await expect(create(event())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects guidance autosaved without a timeline version change', async () => {
    mocks.query.mockImplementation((sql: string) => Promise.resolve({ rows: sql.includes('FROM media_timelines') ? [{ campaign_prompt: { ...settings, prompt: 'Newly reviewed prompt' } }] : [{ client_id: clientId, current_timeline_id: 'timeline-1', created_by: 'creator', media_type: 'av' }] }))
    await expect(create(event())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects foreign guidance in a manually supplied seed timeline', async () => {
    await expect(create(event({ campaignSourceProjectId: undefined, initialState: { media_type: 'av', campaign_prompt: { ...settings, clientId: 'bc8a15a8-f523-4a75-a8f4-a501649bb71d' } } }))).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects an AV seed when the copied project type was dropped', async () => {
    await expect(create(event({ campaignSourceProjectId: undefined, mediaType: 'audio', initialState: { media_type: 'av' } }))).rejects.toMatchObject({ statusCode: 400 })
  })
  it('protects source-project reads with project and client access', async () => {
    await read({} as Parameters<typeof read>[0])
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), clientId)
    mocks.auth.mockResolvedValue({ id: 'another-producer', role: 'editor' })
    await expect(read({} as Parameters<typeof read>[0])).rejects.toMatchObject({ statusCode: 403 })
  })
})
