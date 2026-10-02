import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProjectWithCurrentTimeline } from '~~/server/utils/audio/projects'

const rows = vi.hoisted(() => ({ current: { id: 'timeline-1', state: {} as Record<string, unknown> } }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: vi.fn(async (sql: string) => sql.includes('media_projects')
    ? { id: 'project-1', current_timeline_id: 'timeline-1', client_id: 'client-1', status: 'draft' }
    : structuredClone(rows.current)),
  // A normal cached read can return the timeline from before the producer saved.
  queryOne: vi.fn(async () => ({ id: 'timeline-1', state: {} })),
  queryRows: vi.fn(),
  transaction: vi.fn()
}))
describe('saved media project readback', () => {
  beforeEach(() => {
    rows.current = { id: 'timeline-1', state: {} }
  })
  it('reopening a project sees a newly saved campaign prompt immediately', async () => {
    expect((await getProjectWithCurrentTimeline('project-1'))?.timeline?.state.campaign_prompt).toBeUndefined()
    const campaignPrompt = { clientId: 'client-1', brief: 'Book a demo', guideRules: '', prompt: 'Preserve the artwork.' }
    rows.current.state = { campaign_prompt: campaignPrompt }
    expect((await getProjectWithCurrentTimeline('project-1'))?.timeline?.state.campaign_prompt).toEqual(campaignPrompt)
  })
  it('also sees the latest saved timeline edits', async () => {
    rows.current.state = { duration_sec: 6, tracks: [{ id: 'video', clips: [{ id: 'new-clip' }] }] }
    expect((await getProjectWithCurrentTimeline('project-1'))?.timeline?.state).toEqual(rows.current.state)
  })
})
