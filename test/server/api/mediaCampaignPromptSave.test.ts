import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), project: vi.fn(), save: vi.fn(), query: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access }))
vi.mock('~~/server/utils/audio/projects', () => ({ getProjectWithCurrentTimeline: mocks.project, getTimelineIn: vi.fn(), saveDraftTimelineIn: mocks.save }))
vi.mock('~~/server/utils/audio/godModeMutations', () => ({ executeGodModeMediaTimelineSave: (_event: unknown, mutate: (db: unknown) => unknown) => mutate({ query: mocks.query }) }))
Object.assign(globalThis, {
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: () => 'project-1',
  readBody: (event: { body: unknown }) => Promise.resolve(event.body),
  createError: (value: { statusMessage: string }) => Object.assign(new Error(value.statusMessage), value)
})
const handler = (await import('~~/server/api/agency/audio/projects/[id]/timeline.put')).default
const clientId = 'f7c142a6-a63f-4f75-90aa-700db68c1c76'
const draft = { clientId, brief: 'Book a demo', guideRules: '', prompt: 'Preserve logo.' }
describe('project campaign prompt persistence access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'creator', role: 'editor' })
    mocks.access.mockResolvedValue({})
    mocks.project.mockResolvedValue({ project: { id: 'project-1', createdBy: 'creator', clientId, status: 'draft', currentTimelineId: 'timeline-1' } })
    mocks.query.mockResolvedValue({ rows: [{ client_id: clientId, current_timeline_id: 'timeline-1', status: 'draft' }] })
    mocks.save.mockImplementation((_db, _id, state) => Promise.resolve({ state }))
  })
  it('persists the reviewed prompt for the current project client', async () => {
    const result = await handler({ body: { state: { campaign_prompt: draft } } } as unknown as Parameters<typeof handler>[0])
    expect(result.timeline.state.campaign_prompt).toEqual(draft)
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), clientId)
  })
  it('discards campaign guidance saved for a previous client', async () => {
    const result = await handler({ body: { state: { campaign_prompt: { ...draft, clientId: 'bc8a15a8-f523-4a75-a8f4-a501649bb71d' } } } } as unknown as Parameters<typeof handler>[0])
    expect(result.timeline.state.campaign_prompt).toBeUndefined()
  })
  it('denies a non-owner editing someone else’s project', async () => {
    mocks.auth.mockResolvedValue({ id: 'someone-else', role: 'editor' })
    await expect(handler({ body: { state: {} } } as unknown as Parameters<typeof handler>[0])).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('denies a creator who no longer has client access', async () => {
    mocks.access.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(handler({ body: { state: {} } } as unknown as Parameters<typeof handler>[0])).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('refuses a save when the project was reassigned while the request was in flight', async () => {
    mocks.query.mockResolvedValue({ rows: [{ client_id: 'bc8a15a8-f523-4a75-a8f4-a501649bb71d', current_timeline_id: 'timeline-1', status: 'draft' }] })
    await expect(handler({ body: { state: { campaign_prompt: draft } } } as unknown as Parameters<typeof handler>[0])).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
