import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { createProject, saveDraftTimeline, createVersion, createRenderJob } from '~~/server/utils/audio/projects'

// Opt-in, isolated Neon branch only. The default suite never opens a connection.
const connectionString = process.env.MEDIA_TIMELINE_TEST_DATABASE_URL
const expectedHost = process.env.MEDIA_TIMELINE_TEST_DATABASE_HOST
const database = connectionString ? new URL(connectionString) : null
if (database && (!expectedHost || database.hostname !== expectedHost || expectedHost.includes('ep-lively-fog-a4dum154'))) throw new Error('An explicit isolated database host is required')
const pool = database ? new Pool({ connectionString, max: 4 }) : null
vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRows: vi.fn(),
  transaction: async (operation: (db: unknown) => Promise<unknown>) => {
    const client = await pool!.connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}))

const projects: string[] = []
const actor = { id: randomUUID(), role: 'member' }
async function fixture() {
  const result = await createProject({ createdBy: actor.id, clientId: null, title: 'Synthetic T02 race fixture', initialState: emptyAvTimeline(), mediaType: 'av' })
  projects.push(result.project.id)
  return { projectId: result.project.id, actor, expectedTimelineId: result.timeline.id, expectedEditRevision: result.timeline.editRevision, state: emptyAvTimeline() }
}

describe.skipIf(!database)('isolated database timeline races', { timeout: 30000 }, () => {
  beforeAll(async () => {
    const columns = await pool!.query('SELECT column_name FROM information_schema.columns WHERE table_name=\'media_timelines\' AND column_name=\'edit_revision\'')
    expect(columns.rows).toHaveLength(1)
  })
  afterAll(async () => {
    for (const id of projects) {
      await pool!.query('DELETE FROM media_render_jobs WHERE project_id = $1', [id])
      await pool!.query('DELETE FROM media_projects WHERE id = $1', [id])
    }
    await pool!.end()
  })

  it('two writers at revision zero produce exactly one revision-one commit', async () => {
    const input = await fixture()
    const results = await Promise.allSettled([
      saveDraftTimeline({ ...input, state: { ...input.state, width: 720 } }),
      saveDraftTimeline({ ...input, state: { ...input.state, width: 1920 } })
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason.statusCode).toBe(409)
    const row = (await pool!.query('SELECT edit_revision, state FROM media_timelines WHERE id=$1', [input.expectedTimelineId])).rows[0]
    expect(row.edit_revision).toBe(1)
    expect([720, 1920]).toContain(row.state.width)
  })

  it('a version-pointer change fences a late save against the former draft', async () => {
    const input = await fixture()
    const next = await createVersion({ ...input, label: 'Checkpoint' })
    await expect(saveDraftTimeline(input)).rejects.toMatchObject({ statusCode: 409 })
    expect(next.id).not.toBe(input.expectedTimelineId)
    expect(next.schemaVersion).toBe(2)
    expect(next.editRevision).toBe(0)
  })

  it('render snapshot bytes remain unchanged after the next draft save', async () => {
    const input = await fixture()
    const job = await createRenderJob({ ...input, channels: [] })
    const next = await saveDraftTimeline({ ...input, state: { ...input.state, width: 720 } })
    expect(next.id).toBe(input.expectedTimelineId)
    const frozen = (await pool!.query('SELECT state FROM media_timelines WHERE id=$1', [job.timelineId])).rows[0]
    expect(frozen.state.width).toBe(1080)
    const pointer = (await pool!.query('SELECT current_timeline_id FROM media_projects WHERE id=$1', [input.projectId])).rows[0]
    expect(pointer.current_timeline_id).toBe(input.expectedTimelineId)
  })

  it('saves fork an active legacy render snapshot instead of mutating job input', async () => {
    const input = await fixture()
    const job = await createRenderJob({ ...input, channels: [] })
    await pool!.query('UPDATE media_projects SET current_timeline_id=$1 WHERE id=$2', [job.timelineId, input.projectId])
    const next = await saveDraftTimeline({ ...input, expectedTimelineId: job.timelineId, state: { ...input.state, width: 720 } })
    expect(next.id).not.toBe(job.timelineId)
    expect(next.editRevision).toBe(1)
    const frozen = (await pool!.query('SELECT state FROM media_timelines WHERE id=$1', [job.timelineId])).rows[0]
    expect(frozen.state.width).toBe(1080)
  })

  it('ownership denial preserves the current state', async () => {
    const input = await fixture()
    await expect(saveDraftTimeline({ ...input, actor: { id: randomUUID(), role: 'member' } })).rejects.toMatchObject({ statusCode: 403 })
    const row = (await pool!.query('SELECT edit_revision FROM media_timelines WHERE id=$1', [input.expectedTimelineId])).rows[0]
    expect(row.edit_revision).toBe(0)
  })
})
