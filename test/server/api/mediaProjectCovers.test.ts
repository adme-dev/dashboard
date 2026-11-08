import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaProject } from '~~/app/types'
import { projectCovers } from '~~/server/utils/audio/projectCovers'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.query }))

const actor = { id: 'actor', role: 'member' }
const project = (id: string, createdBy = actor.id, mediaType: 'audio' | 'av' = 'av'): MediaProject => ({
  id, createdBy, mediaType, clientId: null, title: id, status: 'draft',
  currentTimelineId: null, createdAt: '', updatedAt: ''
})
beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue([])
})

describe('authorized project cover projection', () => {
  it('does not request media for unrelated projects or audio projects', async () => {
    expect(await projectCovers([project('other', 'someone-else'), project('audio', actor.id, 'audio')], actor)).toEqual(new Map())
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it.each([{ role: 'viewer' }, { role: 'guest' }, { role: 'custom', isCustomReadOnly: true }])('returns no covers for read-only roles: %s', async (role) => {
    expect(await projectCovers([project('own')], { ...actor, ...role })).toEqual(new Map())
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('batches eligible projects and returns only canonical authenticated thumbnail routes', async () => {
    mocks.query.mockResolvedValue([{ project_id: 'own', asset_id: 'asset/id' }, { project_id: 'not-requested', asset_id: 'private' }])
    const covers = await projectCovers([project('own'), project('another'), project('other', 'someone-else')], actor)
    expect(mocks.query).toHaveBeenCalledTimes(1)
    const [sql, args] = mocks.query.mock.calls[0]!
    expect(args).toEqual([['own', 'another'], actor.id, false])
    expect(sql).toContain('va.source_project_id = mp.id')
    expect(sql).toContain('va.client_id IS NOT DISTINCT FROM mp.client_id')
    expect(sql).toContain('mp.created_by = $2')
    expect(sql).not.toContain('media_timelines')
    expect(covers).toEqual(new Map([['own', { url: '/api/agency/video/assets/asset%2Fid/thumbnail', kind: 'image', label: 'Project preview' }]]))
  })

  it.each(['admin', 'owner'])('uses the existing administrative project access for %s', async (role) => {
    mocks.query.mockResolvedValue([{ project_id: 'other', asset_id: 'asset' }])
    expect((await projectCovers([project('other', 'another-user')], { ...actor, role })).has('other')).toBe(true)
    expect(mocks.query.mock.calls[0]![1]).toEqual([['other'], actor.id, true])
  })

  it('bounds and deduplicates the query even if a caller exceeds the project list cap', async () => {
    const projects = Array.from({ length: 250 }, (_, index) => project(String(index)))
    await projectCovers([...projects, ...projects], actor)
    expect(mocks.query.mock.calls[0]![1][0]).toHaveLength(200)
    expect(mocks.query.mock.calls[0]![0]).toContain('LIMIT 200')
  })

  it('leaves missing or failed thumbnail lookups as empty covers without preventing project access', async () => {
    expect(await projectCovers([project('own')], actor)).toEqual(new Map())
    mocks.query.mockRejectedValue(new Error('storage metadata unavailable'))
    expect(await projectCovers([project('own')], actor)).toEqual(new Map())
  })
})
