import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveStoryboardRevisionIn, getStoryboardIn } from '~~/server/utils/video-storyboard/store'
import { id, storyboardFixture } from './fixtures/storyboard'

const query = vi.fn()
const db = { query }
const actor = { id: id(6), role: 'member' }
beforeEach(() => query.mockReset())
describe('storyboard immutable storage', () => {
  it('checks read access before returning historical revision content', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: id(2), created_by: id(99), media_type: 'av' }] })
    await expect(getStoryboardIn(db, id(2), actor, id(3))).rejects.toMatchObject({ statusCode: 403 })
    expect(query).toHaveBeenCalledTimes(1)
  })
  it('rejects stale revision pointers before inserting content', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: id(2), created_by: actor.id, media_type: 'av' }] })
    query.mockResolvedValueOnce({ rows: [{ id: id(1), project_id: id(2), current_revision_id: id(99) }] })
    query.mockResolvedValueOnce({ rows: [] })
    const plan = storyboardFixture()
    plan.copy.approval = null
    await expect(saveStoryboardRevisionIn(db, { projectId: id(2), actor, expectedRevision: null, operationId: id(9), plan })).rejects.toMatchObject({ statusCode: 409 })
    expect(query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)/.test(sql))).toBe(false)
  })
})
